import { describe, expect, it } from 'vitest';
import { classifyLocalState } from '../worker/behavioral/localClassifier';

describe('classifyLocalState', () => {
  it('recognizes a diagnosis misunderstanding', () => {
    const state = classifyLocalState('Does this mean I have cancer?');
    expect(state.understanding).toBe('incorrect');
    expect(state.emotion).toBe('uncertain');
    expect(state.barrier).toBe('none');
    expect(state.selfEfficacy).toBe('unknown');
    expect(state.readiness).toBe('unclear');
    expect(state.safetyFlag).toBe('diagnosis_request');
    expect(state.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it.each([
    'Do I have cancer?',
    'Does this mean cancer?',
    'Does elevated mean I have cancer?',
    'Am I diagnosed?',
    'Is this a diagnosis?',
  ])('recognizes diagnosis-request phrasing: "%s"', (message) => {
    const state = classifyLocalState(message);
    expect(state.safetyFlag).toBe('diagnosis_request');
  });

  it('recognizes correct understanding plus fear', () => {
    const state = classifyLocalState('I understand it is only a probability, but I am scared.');
    expect(state.understanding).toBe('correct');
    expect(state.emotion).toBe('worried');
    expect(state.barrier).toBe('fear');
    expect(state.readiness).toBe('considering');
    expect(state.safetyFlag).toBe('none');
  });

  it('recognizes a time barrier', () => {
    const state = classifyLocalState('I want to follow up, but I cannot call while I am working.');
    expect(state.barrier).toBe('time');
    expect(state.selfEfficacy).toBe('moderate');
    expect(state.readiness).toBe('preparing');
    expect(state.safetyFlag).toBe('none');
  });

  it('recognizes a cost barrier', () => {
    const state = classifyLocalState('I cannot afford another appointment.');
    expect(state.barrier).toBe('cost');
    expect(state.readiness).toBe('considering');
  });

  it('recognizes an access barrier with low self-efficacy', () => {
    const state = classifyLocalState('I do not know who to contact.');
    expect(state.barrier).toBe('access');
    expect(state.selfEfficacy).toBe('low');
    expect(state.readiness).toBe('considering');
  });

  it('recognizes a mistrust barrier', () => {
    const state = classifyLocalState('I do not trust the calculator.');
    expect(state.barrier).toBe('mistrust');
    expect(state.readiness).toBe('not_considering');
  });

  it('recognizes a dismissive response', () => {
    const state = classifyLocalState('I do not think this matters.');
    expect(state.emotion).toBe('dismissive');
    expect(state.readiness).toBe('not_considering');
  });

  it('recognizes a ready-to-act statement', () => {
    const state = classifyLocalState('I will message my doctor today.');
    expect(['correct', 'uncertain']).toContain(state.understanding);
    expect(state.emotion).toBe('calm');
    expect(state.barrier).toBe('none');
    expect(state.selfEfficacy).toBe('high');
    expect(state.readiness).toBe('ready');
    expect(state.safetyFlag).toBe('none');
  });

  it.each([
    'I will call tomorrow.',
    'I will schedule an appointment.',
    'I am going to contact my doctor.',
    'I will talk to my doctor about it.',
    'I will follow up next week.',
  ])('recognizes ready-to-act phrasing: "%s"', (message) => {
    const state = classifyLocalState(message);
    expect(state.readiness).toBe('ready');
  });

  it('recognizes a treatment request', () => {
    const state = classifyLocalState('Which medication should I take?');
    expect(state.safetyFlag).toBe('treatment_request');
    expect(state.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it.each(['I found a new lump', 'I have bleeding', 'I have severe breast pain', 'My symptoms are getting worse'])(
    'recognizes an urgent symptom: "%s"',
    (message) => {
      const state = classifyLocalState(message);
      expect(state.safetyFlag).toBe('urgent_symptom');
    },
  );

  it('recognizes an emotional crisis statement', () => {
    const state = classifyLocalState("I don't want to live anymore.");
    expect(state.safetyFlag).toBe('emotional_crisis');
  });

  it('uses conservative defaults for an unclear message', () => {
    const state = classifyLocalState('Can you tell me more?');
    expect(state.understanding).toBe('uncertain');
    expect(state.emotion).toBe('uncertain');
    expect(state.barrier).toBe('none');
    expect(state.selfEfficacy).toBe('unknown');
    expect(state.readiness).toBe('unclear');
    expect(state.confidence).toBeLessThanOrEqual(0.55);
  });

  it('keeps confidence within [0, 1] across a range of inputs', () => {
    const messages = [
      'Does this mean I have cancer?',
      'I am scared.',
      'Which medication should I take?',
      'I found a new lump',
      "I don't want to live anymore.",
      'Can you tell me more?',
      'I will message my doctor today.',
    ];

    for (const message of messages) {
      const state = classifyLocalState(message);
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('preserves the most important safety flag when multiple conditions are present', () => {
    const state = classifyLocalState('I have cancer, and which medication should I take?');
    expect(['diagnosis_request', 'treatment_request']).toContain(state.safetyFlag);
  });

  it('prioritizes emotional crisis over an urgent symptom mentioned in the same message', () => {
    const state = classifyLocalState('I found a new lump and I do not want to live anymore.');
    expect(state.safetyFlag).toBe('emotional_crisis');
  });

  it('uses previousState as a per-field fallback but never inherits a stale safety flag', () => {
    const first = classifyLocalState('I found a new lump');
    expect(first.safetyFlag).toBe('urgent_symptom');

    const second = classifyLocalState('ok thanks', first);
    expect(second.safetyFlag).toBe('none');
    // Unrelated behavioral fields may carry over from the previous turn.
    expect(second.barrier).toBe(first.barrier);
  });
});
