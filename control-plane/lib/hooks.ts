'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiKeyItem,
  AuditLogItem,
  CampaignDetail,
  CampaignScheduleItem,
  CampaignSummary,
  ComplianceEntry,
  ContactDetail,
  ContactGroup,
  ContactItem,
  ContactUpload,
  ContactUploadError,
  DashboardData,
  FraudEventItem,
  FraudRuleItem,
  GlobalSearchGroup,
  MessageItem,
  MessageTrace,
  NotificationItem,
  OperationsOverview,
  PaginatedResponse,
  PricingRuleItem,
  ProviderDetail,
  ProviderItem,
  RetryPolicyItem,
  RoutingRuleItem,
  SenderIdItem,
  TemplateItem,
  WalletSummary,
  WalletTransactionItem,
} from './api-types';
import { apiRequest } from './api';
import { buildRealtimeInterval } from './realtime';
import { useSessionData } from './session-context';

function useTenantKey(): string {
  return useSessionData().tenant.id;
}

export function useDashboardQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['dashboard', tenantId],
    queryFn: () => apiRequest<DashboardData>('/dashboard/tenant'),
    staleTime: 30_000,
  });
}

export function useMessagesQuery(search: string) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['messages', tenantId, search],
    queryFn: () => apiRequest<PaginatedResponse<MessageItem>>(`/messages${search ? `?${search}` : ''}`),
  });
}

export function useMessageTraceQuery(submitDate: string, tenantId: string, id: number) {
  return useQuery({
    queryKey: ['message-trace', submitDate, tenantId, id],
    queryFn: () => apiRequest<MessageTrace>(`/messages/${submitDate}/${tenantId}/${id}/trace`),
  });
}

export function useCampaignsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['campaigns', tenantId],
    queryFn: () => apiRequest<CampaignSummary[]>('/campaigns'),
  });
}

export function useCampaignDetailQuery(id: number) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['campaign-detail', tenantId, id],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${id}`),
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: buildRealtimeInterval(20_000),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

export function useCampaignSchedulesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['campaign-schedules', tenantId],
    queryFn: () => apiRequest<CampaignScheduleItem[]>('/campaign-schedules'),
  });
}

export function useContactsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contacts', tenantId],
    queryFn: () => apiRequest<ContactItem[]>('/contacts'),
  });
}

export function useContactDetailQuery(id: number) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contact-detail', tenantId, id],
    queryFn: () => apiRequest<ContactDetail>(`/contacts/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useContactGroupsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contact-groups', tenantId],
    queryFn: () => apiRequest<ContactGroup[]>('/contact-groups'),
  });
}

export function useContactGroupDetailQuery(id: number) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contact-group-detail', tenantId, id],
    queryFn: () => apiRequest<ContactGroup>(`/contact-groups/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useContactUploadsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contact-uploads', tenantId],
    queryFn: () => apiRequest<ContactUpload[]>('/contact-uploads'),
  });
}

export function useContactUploadErrorsQuery(id: number) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['contact-upload-errors', tenantId, id],
    queryFn: () => apiRequest<ContactUploadError[]>(`/contact-uploads/${id}/errors`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useTemplatesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['templates', tenantId],
    queryFn: () => apiRequest<TemplateItem[]>('/templates'),
  });
}

export function useSenderIdsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['sender-ids', tenantId],
    queryFn: () => apiRequest<SenderIdItem[]>('/sender-ids'),
  });
}

export function useWalletQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['wallet', tenantId],
    queryFn: () => apiRequest<WalletSummary>('/wallet'),
  });
}

export function useWalletTransactionsQuery(search: string) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['wallet-transactions', tenantId, search],
    queryFn: () => apiRequest<PaginatedResponse<WalletTransactionItem>>(`/wallet/transactions${search ? `?${search}` : ''}`),
  });
}

export function useApiKeysQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['api-keys', tenantId],
    queryFn: () => apiRequest<ApiKeyItem[]>('/api-keys'),
  });
}

export function useProvidersQuery() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => apiRequest<ProviderItem[]>('/providers'),
  });
}

export function useProviderDetailQuery(id: number) {
  return useQuery({
    queryKey: ['provider-detail', id],
    queryFn: () => apiRequest<ProviderDetail>(`/providers/${id}`),
    refetchInterval: buildRealtimeInterval(15_000),
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

export function useRoutingRulesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['routing-rules', tenantId],
    queryFn: () => apiRequest<RoutingRuleItem[]>('/routing/rules'),
  });
}

export function usePricingRulesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['pricing-rules', tenantId],
    queryFn: () => apiRequest<PricingRuleItem[]>('/routing/pricing-rules'),
  });
}

export function useRetryPoliciesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['retry-policies', tenantId],
    queryFn: () => apiRequest<RetryPolicyItem[]>('/routing/retry-policies'),
  });
}

export function useOperationsOverviewQuery() {
  return useQuery({
    queryKey: ['operations-overview'],
    queryFn: () => apiRequest<OperationsOverview>('/operations/overview'),
    refetchInterval: buildRealtimeInterval(15_000),
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

export function useNotificationsQuery(limit = 20) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['notifications', tenantId, limit],
    queryFn: () => apiRequest<{ items: NotificationItem[] }>(`/notifications?limit=${limit}`),
    refetchInterval: buildRealtimeInterval(60_000),
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}

export function useGlobalSearchQuery(query: string) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['global-search', tenantId, query],
    queryFn: () => apiRequest<{ groups: GlobalSearchGroup[] }>(`/search/global?q=${encodeURIComponent(query)}&limit=8`),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });
}

export function useAuditLogsQuery(search: string) {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['audit-logs', tenantId, search],
    queryFn: () => apiRequest<PaginatedResponse<AuditLogItem>>(`/audit/logs${search ? `?${search}` : ''}`),
  });
}

export function useFraudRulesQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['fraud-rules', tenantId],
    queryFn: () => apiRequest<FraudRuleItem[]>('/fraud/rules'),
  });
}

export function useFraudEventsQuery() {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: ['fraud-events', tenantId],
    queryFn: () => apiRequest<FraudEventItem[]>('/fraud/events'),
  });
}

export function useComplianceQuery(path: '/compliance/opt-outs' | '/compliance/suppressions') {
  const tenantId = useTenantKey();
  return useQuery({
    queryKey: [path, tenantId],
    queryFn: () => apiRequest<ComplianceEntry[]>(path),
  });
}

export function useApiMutation<TInput extends object, TOutput>(
  key: string[],
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  invalidateKeys: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: key,
    mutationFn: (input: TInput) => apiRequest<TOutput>(path, {
      method,
      body: method === 'DELETE' ? undefined : JSON.stringify(input),
    }),
    retry: false,
    onSuccess: async () => {
      await Promise.all(invalidateKeys.map((invalidateKey) => queryClient.invalidateQueries({ queryKey: invalidateKey })));
    },
  });
}
