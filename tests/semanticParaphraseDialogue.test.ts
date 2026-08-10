import { describe, expect, it, vi, afterEach } from 'vitest';
import { interpretSemanticTurnLocal, detectSemanticFeatures } from '../worker/dialogue/semanticTurn';
import { deriveResponsePlan } from '../worker/dialogue/deriveResponsePlan';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { validateResponseSemantics } from '../worker/dialogue/validateResponseSemantics';
import { getMockRiskResult } from '../worker/mockRisk';
import { generateDynamicResponse } from '../worker/llm/generateDynamicResponse';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { getTheoryConstruct } from '../worker/behavioral/theoryMap';

const risk = getMockRiskResult('elevated');

const PREDICTION_PARAPHRASES = [
  'The calculator knows what will happen to me.',
  'This number predicts my future.',
  'It can tell whether I will get cancer.',
  'The result tells exactly what will happen.',
  'This score seems to be telling my future.',
  'Can the model foresee my personal outcome?',
  'Does the number function like a prediction?',
  'Is the calculator certain about what will happen?',
  'Would this estimate know my eventual diagnosis?',
];

describe('semantic paraphrases — individual prediction misunderstanding', () => {
  it.each(PREDICTION_PARAPHRASES)('classifies paraphrase without sentence-specific rules: %s', (message) => {
    const turn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(turn.topic).toBe('risk_meaning');
    expect(turn.primaryOperation).toBe('correct_misunderstanding');
    expect(turn.stance).toBe('correcting');
    expect(turn.understanding).toBe('incorrect');
    expect(turn.misunderstanding).toBe('risk_means_certainty');
    expect(turn.emotion).toBe('not_expressed');

    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });
    expect(plan.primaryGoal).toMatch(/correct|probability|individual/i);
    expect(plan.directAnswerRequired).toBe(true);
    expect(plan.mustAddress.join(' ')).toMatch(/population|individual|diagnosis/i);
  });

  it('does not infer unsupported emotion from misunderstanding alone', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'The calculator knows what will happen to me.',
      riskResult: risk,
    });
    expect(turn.emotion).toBe('not_expressed');
    expect(turn.currentTurnEvidence.emotion).toBe('not expressed');
    expect(detectSemanticFeatures('The calculator knows what will happen to me.').expressesEmotion).toBe(
      'not_expressed',
    );
  });
});

describe('dynamic wording variation with stable semantics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts three differently worded valid Groq replies for the same semantic state', async () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'The calculator knows what will happen to me.',
      riskResult: risk,
    });
    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });

    const variants = [
      'A risk calculator estimates chance for people with similar inputs. It cannot predict exactly what will happen to you personally, and it is not a diagnosis.',
      'The estimate is a population probability, not a forecast of your individual future. It does not mean the tool knows your outcome with certainty.',
      'This number describes group-level probability. It cannot tell whether any one person will develop breast cancer and should not be read as a personal prediction.',
    ];

    for (const reply of variants) {
      const validation = validateResponseSemantics({
        reply,
        semanticTurn: turn,
        plan,
      });
      expect(validation.valid).toBe(true);
      expect(validation.primaryOperationCompleted).toBe(true);
      expect(validation.genericSubstitutionDetected).toBe(false);
    }

    // Meaningful wording differences across the three.
    expect(new Set(variants.map((v) => v.slice(0, 40))).size).toBe(3);

    const evidence = [
      {
        id: 'ev-risk-interp-1',
        sourceId: 'NCI-RISK-TOOLS-2024',
        title: 'Population probability',
        organization: 'National Cancer Institute',
        section: 'Test section',
        topic: 'elevated_risk_not_current_cancer',
        keywords: ['probability', 'prediction'],
        text: 'A risk calculator estimates probability for people with similar inputs. It cannot predict an individual outcome and is not a diagnosis.',
        status: 'vetted' as const,
        sourceUse: 'medical-rag' as const,
        sourceType: 'government-patient-education' as const,
        sourceUrl: 'https://www.cancer.gov/test',
        accessedDate: '2026-08-04',
        citation: 'Test citation.',
        score: 0.9,
      },
    ];

    const env = {
      ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
      GROQ_API_KEY: 'sk-test',
    };

    const baseInput = {
      latestMessage: 'The calculator knows what will happen to me.',
      recentConversation: [],
      adaptiveState: createDefaultAdaptiveState(),
      strategy: 'clarify_risk' as const,
      theoryConstruct: getTheoryConstruct('clarify_risk'),
      riskResult: risk,
      retrievedEvidence: evidence,
      recentAssistantMessages: [],
      semanticTurn: turn,
      responsePlan: plan,
    };

    const groqReplies: string[] = [];
    for (const reply of variants) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ reply, usedEvidenceIds: ['ev-risk-interp-1'] }) } }],
            model: 'openai/gpt-oss-20b',
          }),
          { status: 200 },
        ),
      );
      const result = await generateDynamicResponse(env as never, baseInput, fetchMock);
      expect(result.responseMode).toBe('groq-dynamic-rag');
      expect(result.reply).toBe(reply);
      expect(
        validateResponseSemantics({ reply: result.reply, semanticTurn: turn, plan }).valid,
      ).toBe(true);
      groqReplies.push(result.reply);
    }

    expect(new Set(groqReplies.map((r) => r.slice(0, 40))).size).toBe(3);

    // Plan-aware local fallback also satisfies the same semantic goal.
    const local = await generateDynamicResponse(
      {
        ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
      } as never,
      { ...baseInput, retrievedEvidence: [] },
    );
    expect(local.responseMode).toBe('local-rag-fallback');
    expect(/probability|predict|diagnosis|population|individual|forecast/i.test(local.reply)).toBe(
      true,
    );
  });
});
