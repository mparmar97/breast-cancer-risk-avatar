import { describe, expect, it, afterEach, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { getMockRiskResult } from '../worker/mockRisk';
import type { ConversationMemory } from '../worker/dialogue/conversationMemory';

interface ChatBody {
  reply: string;
  strategy: string;
  conversationMemory: ConversationMemory;
  decisionState: {
    draftStatus: string;
    selectedOption: string | null;
    actionTiming: string | null;
  };
  dialogueTurnPlan: { primaryGoal: string; dialogueAct: string; nextPendingItem?: { type: string } };
  orchestrationValidation: {
    unnecessaryReconsiderationDetected?: boolean;
    selectedOptionPreserved: boolean;
  };
  dialogueAdvanced: boolean;
  repeatedDialogueMove: string | null;
  currentTurnInterpretation: { primaryIntent: string };
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets };
const risk = getMockRiskResult('elevated');

async function chat(
  message: string,
  history: Array<{ role: string; content: string }>,
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

describe('conversation memory multi-turn progression', () => {
  it('preserves progress across the required eight-turn arc', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const history: Array<{ role: string; content: string }> = [];
    const replies: string[] = [];
    let previousMemory: ConversationMemory | undefined;
    let previousDecision: unknown;
    let pendingItem: unknown;
    let previousAct: string | undefined;
    let previousState: unknown;

    // 1. Risk explanation
    let body = await chat('What does 3.2% mean?', history, {
      previousConversationMemory: previousMemory,
    });
    expect(body.strategy).toBe('clarify_risk');
    expect(body.reply).toMatch(/probability|does not mean|breast cancer/i);
    expect(body.conversationMemory.riskExplanationStatus).toMatch(/explained|understood/);
    replies.push(body.reply);
    history.push({ role: 'user', content: 'What does 3.2% mean?' }, { role: 'assistant', content: body.reply });
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 2. Confirm understanding
    body = await chat('Yes, that makes sense.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.conversationMemory.riskExplanationStatus).toBe('understood');
    expect(body.reply).not.toMatch(/risk estimate describes probability/i);
    expect(body.reply).not.toMatch(/does not mean that you currently have/i);
    replies.push(body.reply);
    history.push({ role: 'user', content: 'Yes, that makes sense.' }, { role: 'assistant', content: body.reply });
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 3. Next-step support
    body = await chat('I understand it, but I do not know what to do next.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.reply).toMatch(/next step|portal|healthcare professional|clinic/i);
    expect(body.conversationMemory.riskExplanationStatus).toBe('understood');
    replies.push(body.reply);
    history.push(
      { role: 'user', content: 'I understand it, but I do not know what to do next.' },
      { role: 'assistant', content: body.reply },
    );
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 4. Select written option
    body = await chat('Writing to the clinic fits my schedule better.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.conversationMemory.selectedCommunicationOption).toMatch(/written clinic message|portal/i);
    expect(body.reply).not.toMatch(/call or (write|message)|which (option|approach)/i);
    replies.push(body.reply);
    history.push(
      { role: 'user', content: 'Writing to the clinic fits my schedule better.' },
      { role: 'assistant', content: body.reply },
    );
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 5. Draft help
    body = await chat('I do not know what to write.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.reply).toMatch(/editable draft|would like help interpreting/i);
    expect(body.dialogueTurnPlan.nextPendingItem?.type).toBe('proposed_draft');
    expect(body.conversationMemory.draftStatus).toMatch(/requested|proposed|revision_requested/);
    replies.push(body.reply);
    history.push({ role: 'user', content: 'I do not know what to write.' }, { role: 'assistant', content: body.reply });
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 6. Accept draft
    body = await chat('That draft sounds clear.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.conversationMemory.draftStatus).toBe('accepted');
    expect(body.reply).toMatch(/draft is ready|ready to use/i);
    expect(body.reply).not.toMatch(/how do you currently feel about discussing/i);
    expect(body.orchestrationValidation.unnecessaryReconsiderationDetected).toBe(false);
    replies.push(body.reply);
    history.push({ role: 'user', content: 'That draft sounds clear.' }, { role: 'assistant', content: body.reply });
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 7. Timing
    body = await chat('I will send it tonight.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.conversationMemory.plannedTiming).toBe('tonight');
    expect(body.reply).toMatch(/tonight|clear next step/i);
    expect(body.reply).not.toMatch(/what action feels realistic|when would you like to send/i);
    replies.push(body.reply);
    history.push({ role: 'user', content: 'I will send it tonight.' }, { role: 'assistant', content: body.reply });
    previousMemory = body.conversationMemory;
    previousDecision = body.decisionState;
    pendingItem = body.dialogueTurnPlan.nextPendingItem;
    previousAct = body.dialogueTurnPlan.dialogueAct;
    previousState = (body as unknown as { adaptiveState: unknown }).adaptiveState;

    // 8. Closing
    body = await chat('Thanks, that answers my question.', history, {
      previousConversationMemory: previousMemory,
      previousDecisionState: previousDecision,
      pendingItem,
      previousAssistantDialogueAct: previousAct,
      previousState,
    });
    expect(body.strategy).toMatch(/close_supportively|confirm_progress/);
    expect(body.reply).toMatch(/welcome|glad|return|anytime|helped/i);
    expect(body.reply).not.toMatch(/how do you currently feel|what action feels realistic/i);
    replies.push(body.reply);

    // Every reply addresses the turn and differs from prior replies.
    expect(new Set(replies).size).toBe(replies.length);
    for (const reply of replies) {
      expect((reply.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    }

    expect(previousMemory.selectedCommunicationOption).toMatch(/written clinic message|portal/i);
    expect(previousMemory.draftStatus).toBe('accepted');
    expect(previousMemory.plannedTiming).toBe('tonight');
    expect(previousMemory.riskExplanationStatus).toBe('understood');
    expect(previousMemory.resolvedIssues).toContain('risk_explanation');
  });
});
