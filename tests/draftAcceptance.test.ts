import { describe, expect, it, afterEach, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { getMockRiskResult } from '../worker/mockRisk';
import { resolvePendingDraft } from '../worker/dialogue/resolvePendingDraft';
import type { PendingConversationItem } from '../worker/dialogue/types';

interface ChatBody {
  reply: string;
  strategy: string;
  decisionState: {
    primaryDecisionalNeed: string;
    decisionStage: string;
    selectedOption: string | null;
    draftAccepted: boolean;
    draftStatus: string;
    draftNeedResolved: boolean;
    actionTiming: string | null;
  };
  decisionSupportStrategy: string;
  decisionTransition: {
    selectedOptionPreserved: boolean;
    draftAcceptedThisTurn: boolean;
    decisionNeedResolved: boolean;
    unnecessaryReconsiderationDetected: boolean;
    draftStatus: string;
  };
  dialogueTurnPlan: { primaryGoal: string; dialogueAct: string };
  orchestrationValidation: {
    draftAccepted?: boolean;
    selectedOptionPreserved: boolean;
    decisionNeedResolved?: boolean;
    dialogueAdvanced?: boolean;
    unnecessaryReconsiderationDetected?: boolean;
  };
  currentTurnInterpretation: { primaryIntent: string };
  adaptiveState: { readiness: string };
  dialogueAdvanced: boolean;
  resolvedMeaning: string | null;
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const env: Env = { ASSETS: assets };
const risk = getMockRiskResult('elevated');

const DRAFT_ASSISTANT =
  'Here is a short editable clinic-message draft. Would you like to revise any part of it?';

const PENDING_DRAFT: PendingConversationItem = {
  type: 'proposed_draft',
  text: 'editable portal message draft',
  draftText:
    'Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it with my personal and family history. Please advise whether a discussion would be appropriate.',
  draftPurpose: 'ask a clinic to help interpret a demonstration risk estimate',
  expectedReplyType: 'review_or_acceptance',
};

const PREVIOUS_DECISION = {
  ...createDefaultDecisionSupportState(),
  decisionTopic: 'review_message_draft' as const,
  decisionStage: 'preparing_action' as const,
  primaryDecisionalNeed: 'low_confidence' as const,
  selectedOption: 'send the drafted clinic message',
  draftStatus: 'proposed' as const,
  draftAccepted: false,
  draftNeedResolved: false,
};

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

describe('draft acceptance dialogue progression', () => {
  it('resolves “That draft sounds clear.” as confirm_proposed_action with accepted draft', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = await chat('That draft sounds clear.', [
      { role: 'assistant', content: DRAFT_ASSISTANT },
    ], {
      pendingItem: PENDING_DRAFT,
      previousDecisionState: PREVIOUS_DECISION,
      previousAssistantDialogueAct: 'plan_action',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.currentTurnInterpretation.primaryIntent === 'confirm_proposed_action' ||
      body.resolvedMeaning?.toLowerCase().includes('accept')).toBeTruthy();
    // Final intent after pending-draft override (exposed via strategy/state).
    expect(body.strategy).toMatch(/confirm_progress|action_planning/);
    expect(body.decisionSupportStrategy).toBe('confirm_selected_action');
    expect(body.decisionState.draftStatus).toBe('accepted');
    expect(body.decisionState.draftAccepted).toBe(true);
    expect(body.decisionState.primaryDecisionalNeed).toBe('none');
    expect(['selected_option', 'planning_action']).toContain(body.decisionState.decisionStage);
    expect(body.decisionState.selectedOption?.toLowerCase()).toMatch(/send.*drafted clinic message/);
    expect(body.adaptiveState.readiness).toBe('preparing');
    expect(body.reply).toMatch(/draft is ready/i);
    expect(body.reply).not.toMatch(/how do you currently feel about discussing/i);
    expect(body.reply).not.toMatch(/what action feels realistic/i);
    expect(body.reply).not.toMatch(/probability|does not mean that you currently have/i);
    expect((body.reply.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(body.orchestrationValidation.draftAccepted).toBe(true);
    expect(body.orchestrationValidation.selectedOptionPreserved).toBe(true);
    expect(body.orchestrationValidation.decisionNeedResolved).toBe(true);
    expect(body.orchestrationValidation.dialogueAdvanced).toBe(true);
    expect(body.orchestrationValidation.unnecessaryReconsiderationDetected).toBe(false);
    expect(body.decisionTransition.unnecessaryReconsiderationDetected).toBe(false);
  });

  it.each([
    'That looks good.',
    'I can use this.',
    'The wording is clear.',
    "I'll use that message.",
    'No changes are needed.',
  ])('accepts paraphrase: %s', async (message) => {
    const resolved = resolvePendingDraft(message, PENDING_DRAFT);
    expect(resolved.kind).toBe('accept');
    expect(resolved.overridePrimaryIntent).toBe('confirm_proposed_action');

    const body = await chat(message, [{ role: 'assistant', content: DRAFT_ASSISTANT }], {
      pendingItem: PENDING_DRAFT,
      previousDecisionState: PREVIOUS_DECISION,
      previousAssistantDialogueAct: 'plan_action',
    });

    expect(body.decisionState.draftStatus).toBe('accepted');
    expect(body.strategy).toMatch(/confirm_progress|action_planning/);
    expect(body.reply).toMatch(/draft is ready/i);
    expect(body.reply).not.toMatch(/how do you currently feel about discussing/i);
  });

  it('treats revision requests as revision_requested, not accepted', async () => {
    const body = await chat('That is close, but can you make it shorter?', [
      { role: 'assistant', content: DRAFT_ASSISTANT },
    ], {
      pendingItem: PENDING_DRAFT,
      previousDecisionState: PREVIOUS_DECISION,
      previousAssistantDialogueAct: 'plan_action',
    });

    expect(body.decisionState.draftStatus).toBe('revision_requested');
    expect(body.decisionState.draftAccepted).toBe(false);
    expect(body.strategy).toMatch(/action_planning|confirm_progress|ask_clarification/);
    expect(body.reply).not.toMatch(/draft is ready to use/i);
    expect(body.reply.length).toBeGreaterThan(20);
  });

  it('respects draft rejection without pressure', async () => {
    const body = await chat('I do not want to send that.', [
      { role: 'assistant', content: DRAFT_ASSISTANT },
    ], {
      pendingItem: PENDING_DRAFT,
      previousDecisionState: PREVIOUS_DECISION,
      previousAssistantDialogueAct: 'plan_action',
    });

    expect(body.decisionState.draftStatus).toBe('rejected');
    expect(body.decisionState.selectedOption).toBeNull();
    expect(body.reply).toMatch(/fine|do not have to send|without pressure/i);
    expect(body.reply).not.toMatch(/you must|you have to|how do you currently feel about discussing/i);
  });
});
