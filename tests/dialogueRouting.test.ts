import { describe, expect, it } from 'vitest';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { getMockRiskResult } from '../worker/mockRisk';
import { checkPlanCompatibility } from '../worker/routing/checkPlanCompatibility';
import { routeDialogueTurn } from '../worker/routing/routeDialogueTurn';
import { validateRoute } from '../worker/routing/validateRoute';
import { validateRouteFulfillment } from '../worker/dialogue/validateRouteFulfillment';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';
import type { DialogueRoute } from '../worker/routing/types';

const risk = getMockRiskResult('elevated');
const env: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

function route(message: string, memory = createDefaultConversationMemory()) {
  const semanticTurn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
  return routeDialogueTurn({
    latestMessage: message,
    riskResult: risk,
    semanticTurn,
    conversationMemory: memory,
  });
}

describe('dialogue routing — natural frequency paraphrases', () => {
  const messages = [
    'Put the percentage into a group of people.',
    'How many people is that out of 100?',
    'Translate the number into a frequency.',
  ];

  it.each(messages)('routes convert for: %s', (message) => {
    const r = route(message);
    expect(r.topic).toBe('risk_representation');
    expect(r.primaryOperation).toBe('convert');
    expect(r.emotion).toBe('not_expressed');
    expect(r.selectedInformationSource).toBe('deterministic_calculation');
    expect(validateRoute({ route: r, latestMessage: message }).valid).toBe(true);
  });
});

describe('dialogue routing — time barrier paraphrases', () => {
  const messages = [
    'Calling during business hours is difficult.',
    'My work schedule makes phone calls impractical.',
    'I cannot call while I am working.',
  ];

  it.each(messages)('routes address_barrier for: %s', (message) => {
    const r = route(message);
    expect(r.topic).toBe('communication_support');
    expect(r.primaryOperation).toBe('address_barrier');
    expect(r.barrier).toBe('time');
    expect(r.emotion).toBe('not_expressed');
  });
});

describe('dialogue routing — screening boundary paraphrases', () => {
  const messages = [
    'Does this result mean I need a mammogram?',
    'Can this score determine my screening schedule?',
    'Should I get an MRI based on this number?',
  ];

  it.each(messages)('routes screening set_boundary for: %s', (message) => {
    const r = route(message);
    expect(r.topic).toBe('screening_guidance');
    expect(r.primaryOperation).toBe('set_boundary');
    expect(r.selectedInformationSource).toMatch(/safety_boundary/);
  });
});

describe('dialogue routing — deferral paraphrases', () => {
  const messages = [
    'I will save it and decide later.',
    'I am keeping the draft but not sending it yet.',
    'Maybe I will use it another day.',
  ];

  it.each(messages)('routes defer for: %s', (message) => {
    const r = route(message);
    expect(r.topic).toMatch(/action_planning|message_drafting/);
    expect(r.primaryOperation).toBe('defer');
    expect(r.stance).toBe('deferring');
  });
});

describe('dialogue routing — prediction misunderstanding without fear', () => {
  it('does not infer fear for individual-prediction claims', () => {
    const r = route('The calculator knows what will happen to me.');
    expect(r.topic).toBe('risk_meaning');
    expect(r.primaryOperation).toBe('correct_misunderstanding');
    expect(r.emotion).toBe('not_expressed');
    expect(r.barrier).toBe('not_expressed');
  });
});

describe('dialogue routing — stale plan compatibility', () => {
  it('discards natural-frequency plan for a work-schedule barrier', () => {
    const previous: DialogueRoute = {
      ...route('Put it into a group of 100 people.'),
    };
    const next = route('My work schedule makes calling difficult.');
    const compat = checkPlanCompatibility({
      route: next,
      previousRoute: previous,
      previousPrimaryGoal: 'provide natural-frequency representation',
    });
    expect(compat.compatible).toBe(false);
    expect(compat.previousPlanDiscarded).toBe(true);
  });

  it('discards action-planning plan for a screening question', () => {
    const previous = route('What should I do next?');
    const next = route('Does this result mean I need a mammogram?');
    const compat = checkPlanCompatibility({
      route: next,
      previousRoute: previous,
      previousPrimaryGoal: 'provide_practical_help',
    });
    expect(compat.compatible).toBe(false);
    expect(compat.previousPlanDiscarded).toBe(true);
  });
});

describe('dialogue routing — multi-turn route replacement', () => {
  it('replaces the active plan on each new routed request', async () => {
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let memory = createDefaultConversationMemory();
    let previousState = undefined as undefined | Awaited<ReturnType<typeof orchestrateDialogueTurn>>['adaptiveState'];
    let previousDecision = undefined as
      | undefined
      | Awaited<ReturnType<typeof orchestrateDialogueTurn>>['decisionState'];
    let previousAct = undefined as
      | undefined
      | Awaited<ReturnType<typeof orchestrateDialogueTurn>>['dialogueTurnPlan']['dialogueAct'];
    let pending = undefined as
      | undefined
      | Awaited<ReturnType<typeof orchestrateDialogueTurn>>['dialogueTurnPlan']['nextPendingItem'];

    const turns: Array<{ message: string; topic: string; operation: string; source?: RegExp }> = [
      {
        message: 'What does 3.2% mean?',
        topic: 'risk_meaning',
        operation: 'explain',
        source: /vetted_medical_rag|deterministic/,
      },
      {
        message: 'Put it into a group of 100 people.',
        topic: 'risk_representation',
        operation: 'convert',
        source: /deterministic_calculation/,
      },
      {
        message: 'So about 3 out of 100 over five years?',
        topic: 'risk_representation',
        operation: 'verify_understanding',
      },
      {
        message: 'My work schedule makes calling difficult.',
        topic: 'communication_support',
        operation: 'address_barrier',
        source: /conversation_memory/,
      },
      {
        message: 'Was this number based on my personal information?',
        topic: 'calculator_validation',
        operation: 'answer_factual_question',
        source: /calculator_metadata/,
      },
      {
        message: 'Does it mean I need a mammogram?',
        topic: 'screening_guidance',
        operation: 'set_boundary',
        source: /safety_boundary/,
      },
      {
        message: 'Return to the work-schedule issue.',
        topic: 'communication_support',
        operation: 'address_barrier',
        source: /conversation_memory/,
      },
    ];

    let previousGoal: string | undefined;
    for (const turn of turns) {
      const result = await orchestrateDialogueTurn(env, {
        latestMessage: turn.message,
        recentConversation: history,
        riskResult: risk,
        previousAdaptiveState: previousState,
        previousDecisionState: previousDecision,
        previousConversationMemory: memory,
        previousAssistantDialogueAct: previousAct,
        pendingConversationItem: pending,
      });

      expect(result.dialogueRoute?.topic).toBe(turn.topic);
      expect(result.dialogueRoute?.primaryOperation).toBe(turn.operation);
      expect(result.dialogueRoute?.emotion).toBe('not_expressed');
      if (turn.source) {
        expect(result.dialogueRoute?.selectedInformationSource).toMatch(turn.source);
      }

      if (previousGoal && turn.operation !== 'verify_understanding') {
        // New routes should discard incompatible prior plans.
        if (
          turn.operation === 'address_barrier' ||
          turn.operation === 'set_boundary' ||
          turn.operation === 'convert' ||
          turn.operation === 'answer_factual_question'
        ) {
          expect(result.planCompatibility?.previousPlanDiscarded).toBe(true);
        }
      }

      if (turn.operation === 'address_barrier') {
        expect(result.response).not.toMatch(/\b3\s+out of\s+100\b/i);
        expect(result.response).toMatch(/call|work|schedule|written|write|time/i);
      }
      if (turn.operation === 'set_boundary') {
        expect(result.response).toMatch(/screening|mammogram|professional|individual/i);
        expect(result.response).not.toMatch(/\byou (should|need to) get (a )?mammogram\b/i);
      }
      if (turn.operation === 'convert') {
        expect(result.response).toMatch(/out of\s*100/i);
      }

      history.push({ role: 'user', content: turn.message }, { role: 'assistant', content: result.response });
      memory = result.conversationMemory;
      previousState = result.adaptiveState;
      previousDecision = result.decisionState;
      previousAct = result.dialogueTurnPlan.dialogueAct;
      pending = result.dialogueTurnPlan.nextPendingItem;
      previousGoal = result.responsePlan?.primaryGoal;
    }
  });
});

describe('dialogue routing — fulfillment validation', () => {
  it('rejects readiness moves for convert routes', () => {
    const r = route('How many people is that out of 100?');
    const validation = validateRouteFulfillment({
      reply: 'How do you currently feel about discussing this result with a clinician?',
      route: r,
    });
    expect(validation.routeFulfilled).toBe(false);
    expect(validation.incompatibleDialogueMoveDetected).toBe(true);
  });

  it('accepts barrier-focused wording for time barriers', () => {
    const r = route('I cannot call while I am working.');
    const validation = validateRouteFulfillment({
      reply:
        'It sounds like time is the main obstacle — calling during work may not fit. Would writing feel more manageable than calling?',
      route: r,
    });
    expect(validation.routeFulfilled).toBe(true);
    expect(validation.staleTopicRepeated).toBe(false);
  });
});
