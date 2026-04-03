import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactUploadsPage from '@/app/(app)/contacts/uploads/page';
import { useContactGroupsQuery, useContactUploadsQuery } from '@/lib/hooks';
import { apiRequest } from '@/lib/api';
import { parseRecipientUpload } from '@/lib/uploads';
import { renderWithSession } from '@/test-utils';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/contacts/uploads',
  useRouter: () => ({
    replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks', () => ({
  useContactUploadsQuery: jest.fn(),
  useContactGroupsQuery: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/uploads', () => ({
  parseRecipientUpload: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ContactUploadsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useContactUploadsQuery as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
    (useContactGroupsQuery as jest.Mock).mockReturnValue({
      data: [{ id: 1, name: 'April subscribers', memberCount: 2, createdAt: '2026-04-02T10:00:00.000Z' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('shows a validation preview before committing a contact upload', async () => {
    const user = userEvent.setup();
    (parseRecipientUpload as jest.Mock).mockResolvedValue({
      csvContent: 'phone_number,name\n+251911123456,Abel\n0911,Invalid\n',
      previewRows: [
        { phone_number: '+251911123456', name: 'Abel' },
        { phone_number: '0911', name: 'Invalid' },
      ],
      duplicateCount: 1,
    });
    (apiRequest as jest.Mock).mockResolvedValue({ uploadId: 12, invalidRows: 1 });

    renderWithSession(<ContactUploadsPage />);

    const file = new File(['phone_number,name\n+251911123456,Abel\n0911,Invalid\n'], 'bulk.csv', {
      type: 'text/csv',
    });

    await user.upload(screen.getByLabelText(/recipient file/i), file);

    expect(await screen.findByText(/bulk.csv/i)).toBeInTheDocument();
    expect(screen.getByText(/1 duplicate values detected/i)).toBeInTheDocument();
    expect(screen.getByText(/\+251911123456/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /commit import/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/contact-uploads/inline', expect.objectContaining({
        method: 'POST',
      }));
    });
  });
});
