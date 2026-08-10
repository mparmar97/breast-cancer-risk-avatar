import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from '../worker/index';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { classifyLocalStateDetailed } from '../worker/behavioral/localClassifier';
import { selectDialogueStrategy } from '../worker/behavioral/policy';
import type { Intent } from '../worker/behavioral/state';
import { transitionDecisionState } from '../worker/decisionSupport/transitionDecisionState';
import { transitionState } from '../worker/behavioral/transitionState';
import { resolveShortReply } from '../worker/dialogue/resolveShortReply';
import type { CurrentTurnInterpretation } from '../worker/dialogue/types';

interface ChatBody {
  reply: string;
  strategy: string;
  decisionState: {
    primaryDecisionalNeed: string;
    decisionStage: string;
    selectedOption: string | null;
  };
  currentTurnInterpretation: { primaryIntent: string; secondaryIntents: string[] };
  adaptiveState: { barrier: string; emotion: string };
  stateTransition: { barrierCleared: boolean; previousBarrier: string };
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets };

async function chat(message: string, extras: Record<string, unknown> = {}): Promise<ChatBody> {
  const response = await worker.fetch(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [], ...extras }),
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

describe('researchGapBehavior — mixed and changing states', () => {
  it('answers percentage explanation as primary when worry is also present', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const body = await chat('I am worried. Can you explain the percentage?');
    expect(body.strategy).toBe('clarify_risk');
    expect(body.reply).toMatch(/probability|percent|estimate|diagnosis/i);
    expect(body.reply.toLowerCase()).not.toMatch(/^it sounds like seeing this result has been worrying/);
  });

  it('gives latest intention priority over prior refusal', () => {
    const previous = {
      understanding: 'correct' as const,
      emotion: 'dismissive' as const,
      barrier: 'none' as const,
      selfEfficacy: 'unknown' as const,
      readiness: 'not_considering' as const,
      safetyFlag: 'none' as const,
      confidence: 0.5,
    };
    const local = classifyLocalStateDetailed('I was not going to contact anyone, but now I might send a message.', previous);
    const strategy = selectDialogueStrategy(local.state, { intent: local.intent });
    expect(['action_planning', 'support_self_efficacy', 'explore_readiness']).toContain(strategy);
    // Latest intention should move strategy/state toward preparing/action rather than keeping a permanent refusal label.
    expect(['preparing', 'ready', 'considering']).toContain(local.state.readiness);
  });

  it('treats keep putting it off as delay, not access', () => {
    const local = classifyLocalStateDetailed('I know who to contact, but I keep putting it off.');
    expect(local.state.barrier).toBe('delay');
    expect(local.state.barrier).not.toBe('access');
  });

  it('clears access barrier when the user finds the clinic portal', () => {
    const previous = {
      understanding: 'uncertain' as const,
      emotion: 'uncertain' as const,
      barrier: 'access' as const,
      selfEfficacy: 'low' as const,
      readiness: 'considering' as const,
      safetyFlag: 'none' as const,
      confidence: 0.4,
    };
    const interpretation: CurrentTurnInterpretation = {
      primaryIntent: 'express_confidence',
      secondaryIntents: [] as Intent[],
      understanding: 'uncertain',
      emotion: 'uncertain',
      barrier: 'none',
      selfEfficacy: 'moderate',
      readiness: 'preparing',
      safetyFlag: 'none',
      currentTurnEvidence: {
        intent: 'found clinic portal',
        understanding: 'not expressed',
        emotion: 'not expressed',
        barrier: 'found clinic portal',
        selfEfficacy: 'I found my clinic portal',
        readiness: 'not expressed',
        safetyFlag: 'not expressed',
      },
      refersToPreviousAssistantTurn: false,
      shortReplyType: 'not_short_reply',
      confidence: 0.7,
    };
    const resolvedShortReply = resolveShortReply('I found the clinic portal.');
    const transition = transitionState({
      previousState: previous,
      interpretation,
      resolvedShortReply,
      barrierUnmentionedTurns: 0,
    });
    expect(transition.metadata.barrierCleared || transition.state.barrier === 'none').toBe(true);
  });

  it('supports decision deferral without coercion', async () => {
    const body = await chat('I do not want to decide today.');
    expect(body.decisionState.decisionStage).toBe('deferred');
    expect(body.reply).not.toMatch(/\byou must\b|\byou have to\b|\bdo not delay\b/i);
  });

  it('closes supportively without opening new decision pressure', async () => {
    const body = await chat('Thanks, that answers my question.');
    expect(body.strategy).toBe('close_supportively');
    expect(body.decisionState.decisionStage).toBe('closed');
    expect(body.reply).not.toMatch(/what is the main obstacle|would sending a patient-portal/i);
  });

  it('treats farewell wrap-ups as closing, not readiness exploration', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const body = await chat('okay thanks see you later.');
    expect(body.currentTurnInterpretation.primaryIntent).toBe('conversation_closing');
    expect(body.strategy).toBe('close_supportively');
    expect(body.decisionState.decisionStage).toBe('closed');
    expect(body.reply).not.toMatch(/how do you currently feel about discussing/i);
    expect(body.reply).toMatch(/welcome|glad|return anytime|anytime/i);
  });

  it('does not reopen information need after understanding when asking what next', () => {
    const decision = transitionDecisionState({
      latestMessage: 'I understand it, but I do not know what to do next.',
      interpretation: {
        primaryIntent: 'request_next_step',
        secondaryIntents: [],
        understanding: 'correct',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'considering',
        safetyFlag: 'none',
        currentTurnEvidence: {
          intent: 'what to do next',
          understanding: 'I understand it',
          emotion: 'not expressed',
          barrier: 'not expressed',
          selfEfficacy: 'not expressed',
          readiness: 'not expressed',
          safetyFlag: 'not expressed',
        },
        refersToPreviousAssistantTurn: false,
        shortReplyType: 'not_short_reply',
        confidence: 0.8,
      },
      primaryIntent: 'request_next_step',
      secondaryIntents: [],
      adaptiveState: {
        understanding: 'correct',
        emotion: 'uncertain',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'considering',
        safetyFlag: 'none',
        confidence: 0.8,
      },
      previousDecisionState: {
        ...createDefaultDecisionSupportState(),
        informationNeedResolved: true,
        primaryDecisionalNeed: 'resolved',
        decisionTopic: 'risk_interpretation',
      },
      resolvedShortReply: { isShortReply: false, shortReplyType: 'not_short_reply', requiresClarification: false },
    });

    expect(decision.state.primaryDecisionalNeed).toBe('unclear_options');
    expect(decision.state.primaryDecisionalNeed).not.toBe('missing_information');
  });
});
