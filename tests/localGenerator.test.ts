import { describe, expect, it } from 'vitest';
import type { DialogueStrategy } from '../worker/behavioral/policy';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import type { AdaptiveState, Barrier } from '../worker/behavioral/state';
import { generateLocalResponse } from '../worker/llm/localGenerator';
import { getMockRiskResult } from '../worker/mockRisk';

const riskResult = getMockRiskResult('average');

const ALL_STRATEGIES: DialogueStrategy[] = [
  'clarify_risk',
  'acknowledge_emotion',
  'explain_benefit',
  'explore_barrier',
  'support_self_efficacy',
  'action_planning',
  'explore_readiness',
];

const ALL_BARRIERS: Barrier[] = [
  'fear',
  'time',
  'cost',
  'access',
  'mistrust',
  'uncertainty',
  'other',
];

function stateWithBarrier(barrier: Barrier): AdaptiveState {
  return { ...createDefaultAdaptiveState(), barrier };
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const PROHIBITED_CONTENT = [
  /\byou have (breast )?cancer\b/i,
  /\byou are diagnosed\b/i,
  /\bi diagnose\b/i,
  /\btake this medication\b/i,
  /\bi prescribe\b/i,
  /\brecommend (a |this )?(treatment|medication|drug)\b/i,
];

const INTERNAL_LABELS = [
  'understanding',
  'selfEfficacy',
  'self-efficacy',
  'safetyFlag',
  'safety flag',
  'dialoguestrategy',
  'confidence:',
];

describe('generateLocalResponse', () => {
  it('returns a barrier-specific response for each known barrier', () => {
    const seen = new Set<string>();
    for (const barrier of ALL_BARRIERS) {
      const response = generateLocalResponse('explore_barrier', stateWithBarrier(barrier), riskResult);
      expect(response.length).toBeGreaterThan(0);
      seen.add(response);
    }
    // Each barrier should have distinct, tailored wording.
    expect(seen.size).toBe(ALL_BARRIERS.length);
  });

  it('mentions the barrier-appropriate theme for fear, time, cost, and access', () => {
    expect(generateLocalResponse('explore_barrier', stateWithBarrier('fear'), riskResult)).toMatch(/fear/i);
    expect(generateLocalResponse('explore_barrier', stateWithBarrier('time'), riskResult)).toMatch(/time/i);
    expect(generateLocalResponse('explore_barrier', stateWithBarrier('cost'), riskResult)).toMatch(/cost/i);
    expect(generateLocalResponse('explore_barrier', stateWithBarrier('access'), riskResult)).toMatch(
      /begin|primary-care|patient portal/i,
    );
  });

  it('never exceeds 90 words for any strategy', () => {
    for (const strategy of ALL_STRATEGIES) {
      const response = generateLocalResponse(strategy, createDefaultAdaptiveState(), riskResult);
      expect(countWords(response)).toBeLessThanOrEqual(90);
    }
    for (const barrier of ALL_BARRIERS) {
      const response = generateLocalResponse('explore_barrier', stateWithBarrier(barrier), riskResult);
      expect(countWords(response)).toBeLessThanOrEqual(90);
    }
  });

  it('never asks more than one question for any strategy', () => {
    for (const strategy of ALL_STRATEGIES) {
      const response = generateLocalResponse(strategy, createDefaultAdaptiveState(), riskResult);
      expect(countQuestions(response)).toBeLessThanOrEqual(1);
    }
    for (const barrier of ALL_BARRIERS) {
      const response = generateLocalResponse('explore_barrier', stateWithBarrier(barrier), riskResult);
      expect(countQuestions(response)).toBeLessThanOrEqual(1);
    }
  });

  it('never exposes internal state labels in the response text', () => {
    for (const strategy of ALL_STRATEGIES) {
      const response = generateLocalResponse(strategy, createDefaultAdaptiveState(), riskResult).toLowerCase();
      for (const label of INTERNAL_LABELS) {
        expect(response).not.toContain(label.toLowerCase());
      }
    }
  });

  it('never includes a diagnosis or treatment recommendation', () => {
    for (const strategy of ALL_STRATEGIES) {
      const response = generateLocalResponse(strategy, createDefaultAdaptiveState(), riskResult);
      for (const pattern of PROHIBITED_CONTENT) {
        expect(response).not.toMatch(pattern);
      }
    }
  });
});
