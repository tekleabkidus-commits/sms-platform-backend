export const KafkaTopics = {
  SmsAccepted: 'sms.accepted',
  SmsRouted: 'sms.route',
  SmsDispatchRealtime: 'sms.dispatch.realtime',
  SmsDispatchBulk: 'sms.dispatch.bulk',
  SmsRetry: 'sms.retry',
  SmsDlr: 'sms.dlr',
  SmsDispatchResults: 'sms.dispatch.results',
  SmsDlq: 'sms.dlq',
  FraudAlerts: 'fraud.alerts',
} as const;

export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];
