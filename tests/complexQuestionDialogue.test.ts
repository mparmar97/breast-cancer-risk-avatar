import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { getMockRiskResult } from '../worker/mockRisk';

interface ChatBody {
  reply: string;
  requestInterpretation: {
    topic: string;
    operation: string;
    secondaryOperations: string[];
    secondaryIntents: string[];
    explicitRequest: string;
    requestedOutputFormat?: string;
    requiresCalculation: boolean;
  };
  calculationResult: { approximationText: string; numerator: number; denominator: number } | null;
  retrievalQuery: string;
  adaptiveState: { understanding: string; emotion: string };
  decisionState: { informationNeedResolved: boolean };
  conversationMemory: { riskExplanationStatus: string; draftStatus: string; unresolvedNeed?: string };
  operationValidation: {
    valid?: boolean;
    genericSubstitutionDetected: boolean;
    primaryOperationCompleted: boolean;
  };
  fallbackUsed: boolean;
  responseMode: string;
  dialogueTurnPlan: { primaryGoal: string; shouldAskQuestion: boolean; primaryOperation?: string };
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets };
const risk = getMockRiskResult('elevated');

async function chat(
  message: string,
  history: Array<{ role: string; content: string }> = [],
  extras: Record<string, unknown> = {},
): Promise<ChatBody> {
  const response = await worker.fetch(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, riskResult: risk, ...extras }),
    }),
    env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as ChatBody;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('complexQuestionDialogue', () => {
  it('converts 3.2% into natural frequency', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = await chat('Can you explain 3.2% without using percentages?');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.requestInterpretation.topic).toBe('natural_frequency');
    expect(body.requestInterpretation.operation).toBe('convert');
    expect(body.requestInterpretation.requestedOutputFormat).toMatch(/natural frequency/i);
    expect(body.calculationResult?.approximationText).toBe('about 3 out of 100');
    expect(body.reply).toMatch(/about 3 out of 100/i);
    expect(body.reply).toMatch(/five years/i);
    expect(body.reply).toMatch(/probability|approximate|may develop/i);
    expect(body.reply).not.toMatch(/^A risk estimate describes probability over a specified period/i);
    expect(body.dialogueTurnPlan.shouldAskQuestion).toBe(false);
    expect(body.operationValidation.genericSubstitutionDetected).toBe(false);
  });

  it('acknowledges successful teach-back and resolves information need', async () => {
    const body = await chat('So about 3 people out of 100 may develop it during five years?', [], {
      previousState: {
        understanding: 'uncertain',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.5,
      },
      previousConversationMemory: {
        ...createDefaultConversationMemory(),
        riskExplanationStatus: 'explained',
      },
    });

    expect(body.requestInterpretation.operation).toBe('verify_understanding');
    expect(body.adaptiveState.understanding).toBe('correct');
    expect(body.decisionState.informationNeedResolved).toBe(true);
    expect(body.conversationMemory.riskExplanationStatus).toBe('understood');
    expect(body.reply).toMatch(/clear|correct|understand|yes/i);
    expect(body.dialogueTurnPlan.shouldAskQuestion).toBe(false);
    expect(body.reply).not.toMatch(/^A risk estimate describes probability over a specified period/i);
  });

  it('compares five-year and lifetime risk', async () => {
    const body = await chat('What is the difference between five-year and lifetime risk?');
    expect(body.requestInterpretation.topic).toBe('time_horizon');
    expect(body.requestInterpretation.operation).toBe('compare');
    expect(body.reply).toMatch(/five-year/i);
    expect(body.reply).toMatch(/lifetime/i);
    expect(body.retrievalQuery.toLowerCase()).toMatch(/five-year|lifetime/);
  });

  it('answers calculator limitations with vetted grounding', async () => {
    const body = await chat(
      'Explain why the calculator cannot predict exactly what will happen to me.',
    );
    expect(body.requestInterpretation.topic).toBe('calculator_limitations');
    expect(['explain', 'identify_limitation']).toContain(body.requestInterpretation.operation);
    expect(body.reply).toMatch(/cannot predict|population|individual|uncertainty|does not/i);
    expect(body.retrievalQuery.toLowerCase()).toMatch(/limitation|population|individual|uncertainty/);
  });

  it('answers inputs plus limitations compound question', async () => {
    const body = await chat(
      'What information did the calculator use, and what important factors might it not include?',
    );
    expect(body.requestInterpretation.operation).toBe('list_information');
    expect(body.requestInterpretation.secondaryOperations).toContain('identify_limitation');
    expect(body.reply).toMatch(/age|family history|input|factor/i);
    expect(body.reply).toMatch(/missing|not include|cannot|population|limit/i);
  });

  it('keeps a brief comparison when two short sentences are requested', async () => {
    const body = await chat('Compare five-year and lifetime risk in two short sentences.');
    expect(body.requestInterpretation.operation).toBe('compare');
    expect(body.requestInterpretation.secondaryOperations).toContain('summarize');
    expect(body.requestInterpretation.requestedOutputFormat).toMatch(/two short sentences/i);
    expect(body.reply).toMatch(/five-year/i);
    expect(body.reply).toMatch(/lifetime/i);
    expect(body.reply.split(/\s+/).length).toBeLessThanOrEqual(130);
  });

  it('acknowledges worry briefly and answers next-step request', async () => {
    const body = await chat(
      'I understand the number, but I am worried and want to know what I should do next.',
    );
    expect(body.requestInterpretation.operation).toBe('provide_options');
    expect(body.requestInterpretation.secondaryIntents).toContain('express_emotion');
    expect(body.reply).toMatch(/concern|worried|understandable/i);
    expect(body.reply).toMatch(/portal|healthcare professional|message|next/i);
  });

  it('drafts a short less-formal portal message', async () => {
    const body = await chat(
      'I can use the portal, but I do not know what to write. Please make it short and not too formal.',
    );
    expect(body.requestInterpretation.operation).toBe('draft');
    expect(body.requestInterpretation.secondaryOperations).toEqual(
      expect.arrayContaining(['shorten', 'change_tone']),
    );
    expect(body.reply).toMatch(/draft|Hi|Thanks|family history/i);
  });

  it('applies all three revision constraints', async () => {
    const body = await chat(
      'Here is my draft. Make it shorter, remove the appointment sentence, and keep the question about family history.',
      [],
      { previousConversationMemory: { ...createDefaultConversationMemory(), draftStatus: 'proposed' } },
    );
    expect(body.requestInterpretation.operation).toBe('revise');
    expect(body.reply).toMatch(/family history/i);
    expect(body.reply).not.toMatch(/\bappointment\b/i);
  });

  it('gives one simple starting step without a list', async () => {
    const body = await chat(
      'I know who to contact, but I keep putting it off. Give me one simple place to start and do not give me a list.',
    );
    expect(body.requestInterpretation.topic).toBe('barrier');
    expect(body.requestInterpretation.operation).toBe('plan_action');
    expect(body.requestInterpretation.requestedOutputFormat).toBe('one simple step');
    expect(body.reply).not.toMatch(/(^|\n)\s*[-*•]\s+/);
    expect(body.reply).not.toMatch(/\b1\.\s+.+\b2\.\s+/);
  });

  it('answers calculator inputs even when prior emotion was worry', async () => {
    const body = await chat('What information did the calculator use?', [], {
      previousState: {
        understanding: 'uncertain',
        emotion: 'worried',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.6,
      },
    });
    expect(body.requestInterpretation.topic).toBe('calculator_inputs');
    expect(body.requestInterpretation.operation).toBe('list_information');
    expect(body.reply).toMatch(/age|family history|input|factor/i);
    expect(body.reply.toLowerCase().indexOf('age') >= 0 || body.reply.toLowerCase().includes('factor')).toBe(
      true,
    );
    // Must not mainly reassure about worry.
    expect(body.reply).not.toMatch(/it is understandable to feel worried about the elevated result/i);
  });

  it('answers diagnosis distinction before a pending draft and preserves draft memory', async () => {
    const body = await chat('Before that, explain why this result is not a diagnosis.', [], {
      previousConversationMemory: {
        ...createDefaultConversationMemory(),
        draftStatus: 'proposed',
        selectedCommunicationOption: 'written clinic message',
        unresolvedNeed: 'review drafted portal message',
      },
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        draftStatus: 'proposed',
        selectedOption: 'written clinic message',
      },
      pendingItem: {
        type: 'proposed_draft',
        text: 'editable portal message draft',
        draftText: 'Hello, I would like help interpreting a demonstration risk estimate.',
        expectedReplyType: 'review_or_acceptance',
      },
    });

    expect(body.requestInterpretation.topic).toBe('calculator_limitations');
    expect(body.reply).toMatch(/diagnosis|population|predict|probability/i);
    expect(body.conversationMemory.draftStatus).toBe('proposed');
  });

  it('performs a new natural-frequency representation even if risk was previously understood', async () => {
    const body = await chat('Explain it again, but as people out of 1,000.', [], {
      previousConversationMemory: {
        ...createDefaultConversationMemory(),
        riskExplanationStatus: 'understood',
        resolvedIssues: ['risk_explanation'],
      },
      previousState: {
        understanding: 'correct',
        emotion: 'neutral',
        barrier: 'none',
        selfEfficacy: 'moderate',
        readiness: 'considering',
        safetyFlag: 'none',
        confidence: 0.8,
      },
    });

    expect(body.requestInterpretation.operation).toBe('convert');
    expect(body.calculationResult?.denominator).toBe(1000);
    expect(body.reply).toMatch(/out of 1000|out of 1,000/i);
  });
});
