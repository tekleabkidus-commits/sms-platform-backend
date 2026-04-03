import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { reauthRequest } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  reauthRequest: jest.fn(),
}));

describe('ConfirmButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires typed confirmation and re-authentication before dangerous actions', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    (reauthRequest as jest.Mock).mockResolvedValue({ reauthToken: 'reauth-token', expiresInSeconds: 300 });

    render(
      <ConfirmButton
        title="Delete API key"
        confirmText="This disables the key immediately."
        requireText="abc123"
        requireReauth
        onConfirm={onConfirm}
      >
        Revoke
      </ConfirmButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    const confirmAction = screen.getByRole('button', { name: /confirm/i });
    expect(confirmAction).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type abc123 to continue/i), {
      target: { value: 'abc123' },
    });
    fireEvent.change(screen.getByLabelText(/password confirmation/i), {
      target: { value: 'ChangeMe123!' },
    });
    expect(confirmAction).toBeEnabled();

    await user.click(confirmAction);

    await waitFor(() => {
      expect(reauthRequest).toHaveBeenCalledWith({ password: 'ChangeMe123!' });
      expect(onConfirm).toHaveBeenCalledWith({ reauthToken: 'reauth-token' });
    });
  });

  it('surfaces re-authentication failures without calling the dangerous action', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    (reauthRequest as jest.Mock).mockRejectedValue(new Error('Password confirmation failed'));

    render(
      <ConfirmButton
        title="Rotate key"
        confirmText="Rotating the key issues a replacement."
        requireReauth
        onConfirm={onConfirm}
      >
        Rotate
      </ConfirmButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Rotate' }));
    fireEvent.change(screen.getByLabelText(/password confirmation/i), {
      target: { value: 'WrongPass1!' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByText(/password confirmation failed/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
