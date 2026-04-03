'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, Button, Field, InlineLoader, Input, PageHeader, Select } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useContactsQuery } from '@/lib/hooks';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { useUrlFilters } from '@/lib/use-url-filters';
import { ContactItem } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  phoneNumber: z.string().min(8),
  name: z.string().optional(),
});

const DEFAULT_FILTERS = {
  search: '',
  active: '',
  page: '1',
  limit: '25',
};

export default function ContactsPage(): React.ReactElement {
  const contacts = useContactsQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm({
    resolver: zodResolver(schema),
  });

  useUnsavedChanges(form.formState.isDirty);

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (contacts.data ?? []).filter((contact) => {
      if (filters.active === 'active' && !contact.isActive) {
        return false;
      }
      if (filters.active === 'inactive' && contact.isActive) {
        return false;
      }
      if (!search) {
        return true;
      }
      return contact.phoneNumber.toLowerCase().includes(search) || (contact.name ?? '').toLowerCase().includes(search);
    });
  }, [contacts.data, filters.active, filters.search]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<ContactItem>[] = [
    {
      id: 'phone',
      header: 'Phone number',
      accessor: (row) => row.phoneNumber,
      cell: (contact) => (
        <div className="flex items-center gap-2">
          <Link href={`/contacts/${contact.id}`} className="font-medium text-slate-900 hover:text-teal-700">
            {contact.phoneNumber}
          </Link>
          <CopyButton value={contact.phoneNumber} label="Copy phone number" />
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      accessor: (row) => row.name ?? '',
      cell: (contact) => contact.name ?? '—',
    },
    {
      id: 'active',
      header: 'State',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (contact) => contact.isActive ? 'Active' : 'Inactive',
    },
    {
      id: 'updated',
      header: 'Updated',
      accessor: (row) => row.updatedAt,
      cell: (contact) => formatDateTime(contact.updatedAt),
    },
  ];

  if (contacts.isLoading) {
    return <InlineLoader label="Loading contacts" />;
  }

  if (contacts.isError || !contacts.data) {
    return <ErrorPanel title="Contacts unavailable" error={contacts.error} onRetry={() => contacts.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contacts"
        title="Tenant contact registry"
        description="Manage individual recipients, then group or upload them for bulk campaign flows."
      />

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Add contact</h2>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await apiRequest('/contacts', {
                  method: 'POST',
                  body: JSON.stringify(values),
                });
                toast.success('Contact saved.');
                form.reset();
                await contacts.refetch();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to save contact');
              }
            })}
          >
            <Field label="Phone number" error={form.formState.errors.phoneNumber?.message}>
              <Input placeholder="+251911234567" {...form.register('phoneNumber')} />
            </Field>
            <Field label="Name">
              <Input placeholder="Abel Tesfaye" {...form.register('name')} />
            </Field>
            <Button type="submit" loading={form.formState.isSubmitting}>Save contact</Button>
          </form>
        </AppCard>

        <div className="space-y-4">
          <AppCard className="grid gap-4 md:grid-cols-2">
            <Field label="Search">
              <Input value={filters.search} placeholder="Phone or name" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
            </Field>
            <Field label="State">
              <Select value={filters.active} onChange={(event) => applyFilters({ ...filters, active: event.target.value, page: '1' })}>
                <option value="">All contacts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </AppCard>
          <DataGrid
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            emptyMessage="No contacts matched the current filters."
            pagination={{
              page,
              pageSize,
              total: filteredRows.length,
              onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
              onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
            }}
            visibilityStorageKey="contacts-grid-columns"
          />
        </div>
      </div>
    </div>
  );
}
