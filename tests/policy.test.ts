import { describe, expect, it } from 'vitest';
import { selectDialogueStrategy } from '../worker/behavioral/policy';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import type { AdaptiveState } from '../worker/behavioral/state';

function state(overrides: Partial<AdaptiveState>): AdaptiveState {
  return { ...createDefaultAdaptiveState(), ...overrides };
}

describe('selectDialogueStrategy', () => {
  it('crisis overrides everything', () => {
    const strategy = selectDialogueStrategy(
      state({
        safetyFlag: 'emotional_crisis',
        understanding: 'incorrect',
        emotion: 'worried',
        barrier: 'fear',
        selfEfficacy: 'low',
        readiness: 'ready',
      }),
    );
    expect(strategy).toBe('urgent_referral');
  });

  it('urgent symptom overrides other states', () => {
    const strategy = selectDialogueStrategy(
      state({
        safetyFlag: 'urgent_symptom',
        understanding: 'incorrect',
        emotion: 'worried',
        readiness: 'ready',
      }),
    );
    expect(strategy).toBe('urgent_referral');
  });

  it('diagnosis request overrides readiness', () => {
    const strategy = selectDialogueStrategy(
      state({ safetyFlag: 'diagnosis_request', readiness: 'ready', selfEfficacy: 'high' }),
    );
    expect(strategy).toBe('safety_boundary');
  });

  it('treatment request overrides readiness', () => {
    const strategy = selectDialogueStrategy(
      state({ safetyFlag: 'treatment_request', readiness: 'ready' }),
    );
    expect(strategy).toBe('safety_boundary');
  });

  it('incorrect understanding overrides barrier', () => {
    const strategy = selectDialogueStrategy(state({ understanding: 'incorrect', barrier: 'time' }));
    expect(strategy).toBe('clarify_risk');
  });

  it('partial understanding overrides barrier', () => {
    const strategy = selectDialogueStrategy(state({ understanding: 'partial', barrier: 'cost' }));
    expect(strategy).toBe('clarify_risk');
  });

  it('worried emotion overrides action planning', () => {
    const strategy = selectDialogueStrategy(state({ emotion: 'worried', readiness: 'ready' }));
    expect(strategy).toBe('acknowledge_emotion');
  });

  it('overwhelmed emotion overrides barrier', () => {
    const strategy = selectDialogueStrategy(state({ emotion: 'overwhelmed', barrier: 'time' }));
    expect(strategy).toBe('acknowledge_emotion');
  });

  it('barrier overrides low self-efficacy', () => {
    const strategy = selectDialogueStrategy(state({ barrier: 'access', selfEfficacy: 'low' }));
    expect(strategy).toBe('explore_barrier');
  });

  it('low self-efficacy selects support_self_efficacy', () => {
    const strategy = selectDialogueStrategy(state({ selfEfficacy: 'low', barrier: 'none' }));
    expect(strategy).toBe('support_self_efficacy');
  });

  it('preparing readiness selects action_planning', () => {
    const strategy = selectDialogueStrategy(state({ readiness: 'preparing' }));
    expect(strategy).toBe('action_planning');
  });

  it('ready readiness selects action_planning', () => {
    const strategy = selectDialogueStrategy(state({ readiness: 'ready' }));
    expect(strategy).toBe('action_planning');
  });

  it('unclear state selects explore_readiness', () => {
    const strategy = selectDialogueStrategy(createDefaultAdaptiveState());
    expect(strategy).toBe('explore_readiness');
  });

  it('"I have cancer, and which medication should I take?" resolves to safety_boundary', () => {
    const strategy = selectDialogueStrategy(state({ safetyFlag: 'treatment_request' }));
    expect(strategy).toBe('safety_boundary');
  });

  it('"I am scared but I will call tomorrow" resolves to acknowledge_emotion', () => {
    const strategy = selectDialogueStrategy(
      state({ emotion: 'worried', barrier: 'fear', readiness: 'ready', selfEfficacy: 'high' }),
    );
    expect(strategy).toBe('acknowledge_emotion');
  });
});
