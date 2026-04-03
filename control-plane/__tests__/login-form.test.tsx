import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';
import { loginRequest } from '@/lib/api';

const replace = jest.fn();
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    refresh,
  }),
}));

jest.mock('@/lib/api', () => ({
  loginRequest: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/tenant code is required/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();
  });

  it('submits valid credentials and redirects to the dashboard', async () => {
    const user = userEvent.setup();
    (loginRequest as jest.Mock).mockResolvedValue({
      user: { id: 'user-1', email: 'owner@example.com', role: 'owner' },
      tenant: { id: 'tenant-1', code: 'acme-et', name: 'Acme', timezone: 'Africa/Addis_Ababa', status: 'active' },
      availableTenants: [],
    });

    render(<LoginForm />);

    await user.type(screen.getByLabelText(/tenant code/i), 'acme-et');
    await user.type(screen.getByLabelText(/email address/i), 'owner@example.com');
    await user.type(screen.getByLabelText(/password/i), 'ChangeMe123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(loginRequest).toHaveBeenCalledWith({
        tenantCode: 'acme-et',
        email: 'owner@example.com',
        password: 'ChangeMe123!',
      });
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });
});
