import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from '../worker/index';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { getMockRiskResult } from '../worker/mockRisk';

interface ChatBody {
  reply: string;
  strategy: string;
  theoryConstruct: { theory: string; construct: string };
  decisionState: {
    primaryDecisionalNeed: string;
    decisionStage: string;
    selectedOption: string | null;
    informationNeedResolved: boolean;
    draftAccepted: boolean;
    actionTiming: string | null;
  };
  decisionSupportStrategy: string;
  decisionSupportTheoryConstruct: { theory: string };
  decisionTransition: { selectedOptionPreserved: boolean; informationNeedResolvedThisTurn: boolean };
  dialogueTurnPlan: { primaryGoal: string; nextPendingItem?: { type: string; draftText?: string } };
  sources: Array<{ id: string }>;
  usedEvidenceIds: string[];
  responseMode: string;
  safetyOverrideApplied: boolean;
  innovationMetadata: { theoriesOperationalized: string[]; deliveryMode: string };
  orchestrationValidation: { decisionalNeedAddressed: boolean; selectedOptionPreserved: boolean };
  currentTurnInterpretation: { primaryIntent: string; secondaryIntents: string[] };
  adaptiveState: { understanding: string; barrier: string };
  stateTransition: { understandingChanged: boolean };
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets }; // no GROQ key → local path, never calls real API

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

describe('orchestrationPipeline', () => {
  it('explains 3.2% with information need and Fuzzy-Trace Theory', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = await chat('What does 3.2% mean?');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.decisionState.primaryDecisionalNeed).toBe('missing_information');
    expect(body.theoryConstruct.theory).toMatch(/Fuzzy-Trace/i);
    expect(body.strategy).toBe('clarify_risk');
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.reply).toMatch(/probability|does not mean|breast cancer/i);
    expect(body.safetyOverrideApplied).toBe(false);
  });

  it('marks information resolved after comprehension confirmation and does not re-explain', async () => {
    const first = await chat('What does 3.2% mean?');
    const second = await chat('Yes, that makes sense.', [
      { role: 'user', content: 'What does 3.2% mean?' },
      { role: 'assistant', content: first.reply },
    ], {
      previousState: {
        understanding: 'uncertain',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.5,
      },
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        decisionTopic: 'risk_interpretation',
        decisionStage: 'information_seeking',
        primaryDecisionalNeed: 'missing_information',
      },
      previousAssistantDialogueAct: first.dialogueTurnPlan.primaryGoal === 'answer_question' ? 'explain_information' : 'explain_information',
      pendingItem: { type: 'comprehension_check', text: 'whether the explanation helped', expectedReplyType: 'affirmation' },
      recentStrategies: [first.strategy],
    });

    expect(second.decisionState.informationNeedResolved).toBe(true);
    expect(second.reply).not.toMatch(/risk estimate describes probability over a specified period/i);
    expect(second.stateTransition.understandingChanged || second.adaptiveState.understanding === 'correct').toBe(true);
  });

  it('shifts to unclear options when the user understands but does not know what to do next', async () => {
    const body = await chat('I understand the result, but I do not know what to do next.', [], {
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        informationNeedResolved: true,
        decisionTopic: 'risk_interpretation',
        primaryDecisionalNeed: 'resolved',
      },
      previousState: {
        understanding: 'correct',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'considering',
        safetyFlag: 'none',
        confidence: 0.7,
      },
    });

    expect(body.decisionState.primaryDecisionalNeed).toBe('unclear_options');
    expect(body.decisionSupportStrategy).toBe('clarify_options');
    expect(body.reply).toMatch(/next step|portal|healthcare professional|message/i);
    expect(body.reply).not.toMatch(/risk estimate describes probability over a specified period/i);
  });

  it('stores selected portal option and preserves it through drafting', async () => {
    const choose = await chat('Writing to the clinic fits my schedule better.', [], {
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        decisionTopic: 'how_to_follow_up',
        decisionStage: 'option_clarification',
        primaryDecisionalNeed: 'unclear_options',
        informationNeedResolved: true,
      },
    });
    expect(choose.decisionState.selectedOption).toBe('portal message');

    const draft = await chat('I do not know what to write.', [
      { role: 'user', content: 'Writing to the clinic fits my schedule better.' },
      { role: 'assistant', content: choose.reply },
    ], {
      previousDecisionState: choose.decisionState,
      previousState: {
        understanding: 'correct',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'moderate',
        readiness: 'preparing',
        safetyFlag: 'none',
        confidence: 0.7,
      },
    });

    expect(draft.decisionState.selectedOption).toBe('portal message');
    expect(draft.decisionTransition.selectedOptionPreserved).toBe(true);
    expect(draft.decisionState.primaryDecisionalNeed).toBe('insufficient_support');
    expect(draft.currentTurnInterpretation.primaryIntent).toBe('request_draft_help');
    expect(draft.dialogueTurnPlan.primaryGoal).toBe('provide_practical_help');
    expect(draft.dialogueTurnPlan.nextPendingItem?.type).toBe('proposed_draft');
    expect(draft.strategy).toBe('action_planning');
    expect(draft.reply).toMatch(/draft|Hello,/i);
    expect(draft.reply).not.toMatch(/while working|time is the main obstacle/i);
  });

  it('accepts a clear draft and then confirms tonight without re-asking timing', async () => {
    const pendingDraft = {
      type: 'proposed_draft',
      draftText:
        'Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it with my personal and family history. Please advise whether a discussion would be appropriate.',
      expectedReplyType: 'review_or_acceptance',
    };
    const review = await chat('That message sounds clear.', [], {
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        selectedOption: 'portal message',
        decisionTopic: 'message_drafting',
        decisionStage: 'preparing_action',
        primaryDecisionalNeed: 'insufficient_support',
        informationNeedResolved: true,
      },
      pendingItem: pendingDraft,
    });
    expect(review.decisionState.draftAccepted).toBe(true);
    expect(review.reply).not.toMatch(/risk estimate describes probability/i);

    const confirm = await chat('I will send it tonight.', [
      { role: 'user', content: 'That message sounds clear.' },
      { role: 'assistant', content: review.reply },
    ], {
      previousDecisionState: review.decisionState,
      pendingItem: { type: 'action_commitment', text: 'whether to send the draft', expectedReplyType: 'affirmation' },
    });
    expect(confirm.decisionState.decisionStage).toBe('action_confirmed');
    expect(confirm.decisionState.actionTiming).toMatch(/tonight/i);
    expect(confirm.reply).not.toMatch(/when would you like to send/i);
  });
});
