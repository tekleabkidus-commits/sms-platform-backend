import { render, waitFor } from '@testing-library/react';
import { SessionWatch } from '@/components/session-watch';
import { logoutRequest } from '@/lib/api';
import { AUTH_FORBIDDEN_EVENT, AUTH_REQUIRED_EVENT } from '@/lib/request-events';

const replace = jest.fn();
const refresh = jest.fn();
const toastError = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    refresh,
  }),
}));

jest.mock('@/lib/api', () => ({
  logoutRequest: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe('SessionWatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logoutRequest as jest.Mock).mockResolvedValue(undefined);
  });

  it('redirects to login when the session expires mid-flow', async () => {
    render(<SessionWatch />);

    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, {
      detail: { message: 'Your session expired.' },
    }));

    await waitFor(() => {
      expect(logoutRequest).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('shows a permission error when a forbidden action is attempted', async () => {
    render(<SessionWatch />);

    window.dispatchEvent(new CustomEvent(AUTH_FORBIDDEN_EVENT, {
      detail: { message: 'You do not have permission for this route.' },
    }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('You do not have permission for this route.');
    });
  });
});
