jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: (value: unknown) => value,
  };
});

import { screen } from '@testing-library/react';
import CampaignDetailPage from '@/app/(app)/campaigns/[id]/page';
import { useCampaignDetailQuery } from '@/lib/hooks';
import { renderWithSession } from '@/test-utils';

jest.mock('@/lib/hooks', () => ({
  useCampaignDetailQuery: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the campaign summary, jobs, schedules, and related failures', async () => {
    (useCampaignDetailQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        id: 1,
        name: 'OTP Warmup',
        status: 'scheduled',
        sourceType: 'api',
        scheduledAt: '2026-04-02T10:30:00.000Z',
        metadata: {
          senderId: 'MYAPP',
          templateRef: 'otp-login',
          trafficType: 'otp',
        },
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
        schedules: [
          {
            id: 1,
            templateRef: 'otp-login',
            senderId: 'MYAPP',
            contactGroupId: 1,
            contactUploadId: 3,
            recurrenceCron: '0 10 * * *',
            timezone: 'Africa/Addis_Ababa',
            nextRunAt: '2026-04-03T07:00:00.000Z',
            shardCount: 2,
            isActive: true,
          },
        ],
        jobs: [
          {
            id: 7,
            status: 'running',
            totalRecords: 100,
            processedRecords: 60,
            acceptedRecords: 58,
            failedRecords: 2,
            shardCount: 2,
            createdAt: '2026-04-02T10:00:00.000Z',
            startedAt: '2026-04-02T10:05:00.000Z',
            completedAt: null,
            lastError: 'Carrier throttled one shard.',
          },
        ],
        performance: {
          totalRecords: 100,
          acceptedRecords: 58,
          deliveredRecords: 54,
          failedRecords: 2,
          pendingRecords: 42,
        },
        recentFailures: [
          {
            id: 99,
            submitDate: '2026-04-02',
            phoneNumber: '+251911000111',
            status: 'failed',
            failedAt: '2026-04-02T10:09:00.000Z',
            lastErrorCode: 'THROTTLED',
            lastErrorMessage: 'Carrier throttled campaign shard 2',
          },
        ],
        auditTrail: [
          {
            id: 11,
            action: 'campaigns.schedule',
            metadata: { createdBy: 'user-1' },
            createdAt: '2026-04-02T10:00:00.000Z',
          },
        ],
      },
    });

    renderWithSession(<CampaignDetailPage params={{ id: '1' } as never} />);

    expect(await screen.findByRole('heading', { name: 'OTP Warmup' })).toBeInTheDocument();
    expect(screen.getByText(/campaign jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/recent failed records/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view related messages/i })).toHaveAttribute('href', '/messages?campaignId=1');
    expect(screen.getAllByRole('link', { name: /upload #3/i })[0]).toHaveAttribute('href', '/contacts/uploads/3');
    expect(screen.getAllByRole('link', { name: /group #1/i })[0]).toHaveAttribute('href', '/contacts/groups/1');
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders a not-found style error panel when no campaign detail is returned', async () => {
    (useCampaignDetailQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: undefined,
      refetch: jest.fn(),
    });

    renderWithSession(<CampaignDetailPage params={{ id: '999' } as never} />);

    expect(await screen.findByText(/campaign unavailable/i)).toBeInTheDocument();
  });
});
