import { describe, expect, it } from 'vitest';
import {
  clinicianSpecialtyPrepFallback,
  detectClinicianSpecialty,
} from '../worker/dialogue/clinicianSpecialty';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { getMockRiskResult } from '../worker/mockRisk';
import worker, { type Env } from '../worker/index';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';

const risk = getMockRiskResult('elevated');
const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets };

describe('clinician specialty direct prep', () => {
  it.each([
    ['surgeon', 'breast surgeon'],
    ['breast oncologist', 'breast oncologist'],
    ['radiologist', 'radiologist'],
  ])('detects specialty from %s', (message, label) => {
    expect(detectClinicianSpecialty(message)).toBe(label);
  });

  it('semantic turn for surgeon delivers clinician questions without clarification', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'surgeon',
      riskResult: risk,
    });
    expect(turn.primaryOperation).toBe('list_information');
    expect(turn.requiresClarification).toBe(false);
    expect(turn.directAnswerRequired).toBe(true);
    expect(turn.entities.selectedOption).toBe('breast surgeon');
    expect(turn.explicitRequest).toMatch(/Do not ask which subtype|Do not ask what topic/i);
  });

  it('chat returns prep for breast oncologist without clarifying focus', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'breast oncologist',
          history: [],
          riskResult: risk,
          previousDecisionState: {
            ...createDefaultDecisionSupportState(),
            informationNeedResolved: true,
            decisionTopic: 'how_to_follow_up',
          },
        }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reply: string;
      dialogueTurnPlan: { primaryGoal: string; shouldAskQuestion: boolean };
    };
    expect(body.dialogueTurnPlan.primaryGoal).toBe('list_questions_for_clinician');
    expect(body.dialogueTurnPlan.shouldAskQuestion).toBe(false);
    expect(body.reply).toMatch(/breast oncologist|oncologist/i);
    expect(body.reply).toMatch(/What does this estimate mean|questions/i);
    expect(body.reply).not.toMatch(/Which type of breast specialist|What would you like the breast oncologist to focus on/i);
    expect(body.reply).not.toMatch(/\?\s*$/);
  });

  it('prep fallback names the specialty', () => {
    expect(clinicianSpecialtyPrepFallback('breast surgeon')).toMatch(/breast surgeon/);
  });
});
