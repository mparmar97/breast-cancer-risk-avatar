import { describe, expect, it } from 'vitest';
import type { DialogueStrategy } from '../worker/behavioral/policy';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import type { AdaptiveState, Barrier } from '../worker/behavioral/state';
import { generateLocalResponse, NO_EVIDENCE_FALLBACK_RESPONSE } from '../worker/llm/localGenerator';
import { getMockRiskResult } from '../worker/mockRisk';
import type { RetrievedEvidence } from '../worker/rag/types';

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

const ALL_BARRIERS: Barrier[] = ['fear', 'time', 'cost', 'access', 'mistrust', 'uncertainty', 'other'];

function stateWithBarrier(barrier: Barrier): AdaptiveState {
  return { ...createDefaultAdaptiveState(), barrier };
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function evidenceWithTopic(topic: string): RetrievedEvidence[] {
  return [
    {
      id: 'nci-test-001',
      sourceId: 'NCI-RISK-TOOLS-2024',
      title: 'How Breast Cancer Risk Assessment Tools Work',
      organization: 'National Cancer Institute',
      section: 'Test section',
      topic,
      keywords: ['test'],
      text: 'Test evidence text.',
      status: 'vetted',
      sourceUse: 'medical-rag',
      sourceType: 'government-patient-education',
      sourceUrl: 'https://www.cancer.gov/news-events/cancer-currents-blog/2024/test',
      accessedDate: '2026-08-04',
      citation: 'Test citation.',
      score: 0.9,
    },
  ];
}

// A topic in RISK_INTERPRETATION_TOPICS (worker/llm/localGenerator.ts), kept
// in sync with the vetted evidence set in worker/rag/evidence.ts.
const GROUNDED_EVIDENCE = evidenceWithTopic('elevated_risk_not_current_cancer');
const UNRELATED_EVIDENCE = evidenceWithTopic('motivational_interviewing_agent');
const NO_EVIDENCE: RetrievedEvidence[] = [];

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
  'similarity',
  'score:',
];

describe('generateLocalResponse', () => {
  it('returns a barrier-specific response for each known barrier', () => {
    const seen = new Set<string>();
    for (const barrier of ALL_BARRIERS) {
      const response = generateLocalResponse({
        strategy: 'explore_barrier',
        state: stateWithBarrier(barrier),
        riskResult,
        evidence: NO_EVIDENCE,
      });
      expect(response.length).toBeGreaterThan(0);
      seen.add(response);
    }
    // Each barrier should have distinct, tailored wording.
    expect(seen.size).toBe(ALL_BARRIERS.length);
  });

  it('mentions the barrier-appropriate theme for fear, time, cost, and access', () => {
    const respondTo = (barrier: Barrier) =>
      generateLocalResponse({ strategy: 'explore_barrier', state: stateWithBarrier(barrier), riskResult, evidence: NO_EVIDENCE });

    expect(respondTo('fear')).toMatch(/fear/i);
    expect(respondTo('time')).toMatch(/time/i);
    expect(respondTo('cost')).toMatch(/cost/i);
    expect(respondTo('access')).toMatch(/begin|primary-care|patient portal/i);
  });

  it('uses the grounded risk-explanation claim for clarify_risk when supporting evidence was retrieved', () => {
    const response = generateLocalResponse({
      strategy: 'clarify_risk',
      state: createDefaultAdaptiveState(),
      riskResult,
      evidence: GROUNDED_EVIDENCE,
    });
    expect(response).toMatch(/does not mean that you currently have breast cancer/i);
  });

  it('falls back to the grounded-information message for clarify_risk when no supporting evidence was retrieved', () => {
    const withNoEvidence = generateLocalResponse({
      strategy: 'clarify_risk',
      state: createDefaultAdaptiveState(),
      riskResult,
      evidence: NO_EVIDENCE,
    });
    const withUnrelatedEvidence = generateLocalResponse({
      strategy: 'clarify_risk',
      state: createDefaultAdaptiveState(),
      riskResult,
      evidence: UNRELATED_EVIDENCE,
    });
    expect(withNoEvidence).toBe(NO_EVIDENCE_FALLBACK_RESPONSE);
    expect(withUnrelatedEvidence).toBe(NO_EVIDENCE_FALLBACK_RESPONSE);
  });

  it('includes the "not a diagnosis" claim for acknowledge_emotion only when grounded', () => {
    const grounded = generateLocalResponse({
      strategy: 'acknowledge_emotion',
      state: createDefaultAdaptiveState(),
      riskResult,
      evidence: GROUNDED_EVIDENCE,
    });
    const ungrounded = generateLocalResponse({
      strategy: 'acknowledge_emotion',
      state: createDefaultAdaptiveState(),
      riskResult,
      evidence: NO_EVIDENCE,
    });
    expect(grounded).toMatch(/not a diagnosis/i);
    expect(ungrounded).not.toMatch(/not a diagnosis/i);
    // Both should still acknowledge the emotion and ask the same question.
    expect(grounded).toMatch(/worrying/i);
    expect(ungrounded).toMatch(/worrying/i);
  });

  it('never exceeds 90 words for any strategy, grounded or not', () => {
    for (const evidence of [NO_EVIDENCE, GROUNDED_EVIDENCE]) {
      for (const strategy of ALL_STRATEGIES) {
        const response = generateLocalResponse({ strategy, state: createDefaultAdaptiveState(), riskResult, evidence });
        expect(countWords(response)).toBeLessThanOrEqual(90);
      }
      for (const barrier of ALL_BARRIERS) {
        const response = generateLocalResponse({
          strategy: 'explore_barrier',
          state: stateWithBarrier(barrier),
          riskResult,
          evidence,
        });
        expect(countWords(response)).toBeLessThanOrEqual(90);
      }
    }
  });

  it('never asks more than one question for any strategy, grounded or not', () => {
    for (const evidence of [NO_EVIDENCE, GROUNDED_EVIDENCE]) {
      for (const strategy of ALL_STRATEGIES) {
        const response = generateLocalResponse({ strategy, state: createDefaultAdaptiveState(), riskResult, evidence });
        expect(countQuestions(response)).toBeLessThanOrEqual(1);
      }
      for (const barrier of ALL_BARRIERS) {
        const response = generateLocalResponse({
          strategy: 'explore_barrier',
          state: stateWithBarrier(barrier),
          riskResult,
          evidence,
        });
        expect(countQuestions(response)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never exposes internal state labels or similarity scores in the response text', () => {
    for (const evidence of [NO_EVIDENCE, GROUNDED_EVIDENCE]) {
      for (const strategy of ALL_STRATEGIES) {
        const response = generateLocalResponse({ strategy, state: createDefaultAdaptiveState(), riskResult, evidence }).toLowerCase();
        for (const label of INTERNAL_LABELS) {
          expect(response).not.toContain(label.toLowerCase());
        }
      }
    }
  });

  it('never includes a diagnosis or treatment recommendation', () => {
    for (const evidence of [NO_EVIDENCE, GROUNDED_EVIDENCE]) {
      for (const strategy of ALL_STRATEGIES) {
        const response = generateLocalResponse({ strategy, state: createDefaultAdaptiveState(), riskResult, evidence });
        for (const pattern of PROHIBITED_CONTENT) {
          expect(response).not.toMatch(pattern);
        }
      }
    }
  });
});
