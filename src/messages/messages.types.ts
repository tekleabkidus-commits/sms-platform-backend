export type MessageStatus =
  | 'accepted'
  | 'routed'
  | 'submitting'
  | 'provider_accepted'
  | 'delivered'
  | 'failed';

export const AllowedTransitions: Record<MessageStatus, MessageStatus[]> = {
  accepted: ['routed', 'failed'],
  routed: ['submitting', 'failed'],
  submitting: ['routed', 'provider_accepted', 'failed'],
  provider_accepted: ['delivered', 'failed'],
  delivered: [],
  failed: [],
};

export interface MessageCompositeId {
  submitDate: string;
  tenantId: string;
  id: number;
}
