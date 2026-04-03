jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: (value: unknown) => value,
  };
});

import { screen } from '@testing-library/react';
import MessageTracePage from '@/app/(app)/messages/[submitDate]/[tenantId]/[id]/page';
import { useMessageTraceQuery } from '@/lib/hooks';
import { renderWithSession } from '@/test-utils';

jest.mock('@/lib/hooks', () => ({
  useMessageTraceQuery: jest.fn(),
}));

describe('MessageTracePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders timeline, routing, billing, and DLR history from the backend trace', async () => {
    (useMessageTraceQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        message: {
          id: 1,
          submitDate: '2026-04-02',
          tenantId: 'tenant-1',
          phoneNumber: '+251911234567',
          body: 'Your OTP is 815204.',
          trafficType: 'otp',
          status: 'delivered',
          version: 4,
          attemptCount: 1,
          providerId: 1,
          providerMessageId: 'provider-1',
          priceMinor: 25,
          billingState: 'debited',
          acceptedAt: '2026-04-02T10:00:00.000Z',
          sentAt: '2026-04-02T10:00:04.000Z',
          deliveredAt: '2026-04-02T10:00:08.000Z',
          routePreview: { senderId: 'MYAPP' },
        },
        correlation: {
          clientMessageId: 'client-1',
          apiIdempotencyKey: 'ui-1',
          providerMessageId: 'provider-1',
          routeRuleId: 1,
          smppConfigId: 1,
          version: 4,
        },
        timeline: [
          {
            eventType: 'provider_accepted',
            statusFrom: 'submitting',
            statusTo: 'provider_accepted',
            attemptNo: 1,
            payload: { ok: true },
            createdAt: '2026-04-02T10:00:01.000Z',
          },
        ],
        billing: [
          {
            kind: 'debit',
            amountMinor: 25,
            currency: 'ETB',
            balanceBeforeMinor: 500000,
            balanceAfterMinor: 499975,
            idempotencyKey: 'wallet-1',
            createdAt: '2026-04-02T10:00:02.000Z',
            metadata: {},
          },
        ],
        dlrHistory: [
          {
            id: 1,
            normalizedStatus: 'delivered',
            processed: true,
            processingError: null,
            receivedAt: '2026-04-02T10:00:08.000Z',
            processedAt: '2026-04-02T10:00:08.500Z',
            payload: { providerStatus: 'DELIVRD' },
          },
        ],
        routingDecision: {
          providerId: 1,
          smppConfigId: 1,
          routeRuleId: 1,
          priceMinor: 25,
          billingState: 'debited',
          attemptCount: 1,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      },
    });

    renderWithSession(<MessageTracePage params={{ submitDate: '2026-04-02', tenantId: 'tenant-1', id: '1' } as never} />);

    expect(await screen.findByRole('heading', { name: /message #1/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /state timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /billing impact/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /dlr history/i })).toBeInTheDocument();
    expect(screen.getAllByText(/provider_accepted/i).length).toBeGreaterThan(0);
  });
});
