import { AllowedTransitions } from '../src/messages/messages.types';

describe('message state machine', () => {
  it('allows only the hardened forward transitions', () => {
    expect(AllowedTransitions.accepted).toContain('routed');
    expect(AllowedTransitions.routed).toContain('submitting');
    expect(AllowedTransitions.submitting).toContain('provider_accepted');
    expect(AllowedTransitions.provider_accepted).toContain('delivered');
    expect(AllowedTransitions.delivered).toEqual([]);
  });
});
