import { AllowedTransitions } from '../src/messages/messages.types';

describe('message state machine', () => {
  it('allows only the hardened forward transitions', () => {
    expect(AllowedTransitions.accepted).toContain('routed');
    expect(AllowedTransitions.routed).toContain('submitting');
    expect(AllowedTransitions.submitting).toContain('provider_accepted');
    expect(AllowedTransitions.submitting).toContain('failed');
    expect(AllowedTransitions.provider_accepted).toContain('delivered');
    expect(AllowedTransitions.provider_accepted).toContain('failed');
    expect(AllowedTransitions.delivered).toEqual([]);
    expect(AllowedTransitions.failed).toEqual([]);
    expect(AllowedTransitions.accepted).not.toContain('failed');
    expect(AllowedTransitions.routed).not.toContain('failed');
    expect(AllowedTransitions.submitting).not.toContain('routed');
    expect(AllowedTransitions.accepted).not.toContain('provider_accepted');
    expect(AllowedTransitions.routed).not.toContain('delivered');
    expect(AllowedTransitions.provider_accepted).not.toContain('accepted');
  });
});
