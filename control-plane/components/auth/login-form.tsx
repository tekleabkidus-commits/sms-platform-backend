'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { loginRequest } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui/primitives';

const schema = z.object({
  tenantCode: z.string().min(2, 'Tenant code is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginValues = z.infer<typeof schema>;

export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tenantCode: '',
      email: '',
      password: '',
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await loginRequest(values);
          toast.success('Welcome back.');
          router.replace('/dashboard');
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Login failed');
        }
      })}
    >
      <Field label="Tenant code" error={form.formState.errors.tenantCode?.message}>
        <Input placeholder="acme-et" {...form.register('tenantCode')} />
      </Field>
      <Field label="Email address" error={form.formState.errors.email?.message}>
        <Input type="email" placeholder="owner@acme.et" {...form.register('email')} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <Input type="password" placeholder="Enter your password" {...form.register('password')} />
      </Field>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
