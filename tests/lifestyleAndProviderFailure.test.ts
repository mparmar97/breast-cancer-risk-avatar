/**
 * Lifestyle routing + provider failure staging.
 * Example sentences live here only — production uses category detectors.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { selectTheoryApplication } from '../worker/dialogue/theoryApplication';
import { validateAssumptions } from '../worker/dialogue/validateAssumptions';
import {
  categorizeProviderError,
  GroqRequestError,
} from '../worker/llm/groqClient';
import { generateDynamicResponse } from '../worker/llm/generateDynamicResponse';
import { classifyAdaptiveState } from '../worker/llm/classifyAdaptiveState';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import { checkPlanCompatibility } from '../worker/routing/checkPlanCompatibility';
import { routeDialogueTurn } from '../worker/routing/routeDialogueTurn';
import type { Env } from '../worker/types';

const risk = getMockRiskResult('elevated');
const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

const envWithGroq: Env = {
  ...envNoGroq,
  GROQ_API_KEY: 'sk-test-key-do-not-log',
};

describe('lifestyle and provider failure', () => {
  it('1: Groq generation failure → lifestyle topic, no portal/appointment, assumptions ok, answered when reply mentions exercise/health', async () => {
    const message = 'Should I focus more on my exercise and health?';
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(semantic.topic).toBe('lifestyle_risk_information');
    expect(semantic.primaryOperation).toBe('answer_general_health_question');
    expect(semantic.directAnswerRequired).toBe(true);
    expect(semantic.emotion).toBe('not_expressed');
    expect(semantic.barrier).toBe('not_expressed');
    expect(semantic.requiresMedicalEvidence).toBe(true);

    const theory = selectTheoryApplication(semantic);
    expect(theory.healthBehaviorTheory).toBe('Health Belief Model');
    expect(theory.communicationTheory).toBe('Motivational Interviewing');
    expect(theory.decisionSupportFramework).toBe('none');
    expect(theory.construct).toMatch(/perceived benefits|cue to action/i);

    const fetchMock = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const result = await orchestrateDialogueTurn(
      { ...envWithGroq, GROQ_API_KEY: 'sk-test' },
      {
        latestMessage: message,
        recentConversation: [],
        riskResult: risk,
      },
    );

    const generation = await generateDynamicResponse(
      envWithGroq,
      {
        latestMessage: message,
        recentConversation: [],
        adaptiveState: result.adaptiveState,
        strategy: 'clarify_risk',
        theoryConstruct: result.theoryConstruct,
        riskResult: risk,
        retrievedEvidence: [],
        recentAssistantMessages: [],
        semanticTurn: semantic,
        responsePlan: result.responsePlan,
        conversationMemory: result.conversationMemory,
        requestInterpretation: result.requestInterpretation,
      },
      fetchMock,
    );

    expect(generation.responseMode).toBe('local-rag-fallback');
    expect(generation.fallbackReason).toBe('generation_provider_failure');
    expect(generation.providerFailureStage).toBe('response_generation');
    expect(generation.providerErrorCategory).toBe('timeout');
    expect(generation.reply.toLowerCase()).toMatch(/exercise|lifestyle|health|physical activity/);
    expect(generation.reply.toLowerCase()).not.toMatch(/patient[- ]?portal|\bportal\b/);
    expect(generation.reply.toLowerCase()).not.toMatch(/next appointment|your appointment|existing visit/);

    const assumptions = validateAssumptions({
      reply: generation.reply,
      conversationMemory: createDefaultConversationMemory(),
    });
    expect(assumptions.valid).toBe(true);
    expect(assumptions.patientPortalAssumed).toBe(false);
    expect(assumptions.appointmentAssumed).toBe(false);

    expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
    expect(result.routingDiagnostics?.latestMessage).toBe(message);
    expect(result.pipelineTrace?.latestMessagePresentAtClassification).toBe(true);
    expect(result.pipelineTrace?.latestMessagePresentAtRouting).toBe(true);
    expect(result.pipelineTrace?.latestMessagePresentAtGeneration).toBe(true);
    expect(result.pipelineTrace?.latestMessagePresentAtValidation).toBe(true);
    expect(result.response.toLowerCase()).toMatch(/exercise|lifestyle|health|physical activity/);
    expect(result.response.toLowerCase()).not.toMatch(/patient[- ]?portal/);
    expect(result.assumptionValidation?.patientPortalAssumed).toBe(false);
    expect(result.assumptionValidation?.appointmentAssumed).toBe(false);
    if (/\b(exercise|health|lifestyle|physical activity)\b/i.test(result.response)) {
      expect(result.directQuestionAnswered).toBe(true);
    }
    expect(result.providerExecution?.providerFailureStage).toBeTruthy();
  });

  it('2: multi-turn prep then exercise → discard previous plan, lifestyle route', async () => {
    const prepMessage =
      'Before going to a healthcare professional, what do you think I should do first?';
    const prepSemantic = interpretSemanticTurnLocal({
      latestMessage: prepMessage,
      riskResult: risk,
    });
    expect(prepSemantic.topic).toBe('professional_interpretation');
    expect(prepSemantic.primaryOperation).toBe('provide_preparation_information');
    expect(prepSemantic.directAnswerRequired).toBe(true);

    const prepResult = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: prepMessage,
      recentConversation: [],
      riskResult: risk,
    });
    expect(prepResult.dialogueRoute?.primaryOperation).toBe('provide_preparation_information');
    expect(prepResult.response.toLowerCase()).toMatch(/question|estimate|history|prepar/);
    expect(prepResult.response.toLowerCase()).not.toMatch(
      /how do you (currently )?feel about discussing/,
    );
    expect(prepResult.response.toLowerCase()).not.toMatch(/patient[- ]?portal/);

    const exerciseMessage = 'Should I focus more on my exercise and health?';
    const exerciseRoute = routeDialogueTurn({
      latestMessage: exerciseMessage,
      riskResult: risk,
      semanticTurn: interpretSemanticTurnLocal({
        latestMessage: exerciseMessage,
        riskResult: risk,
      }),
      conversationMemory: prepResult.conversationMemory,
    });
    expect(exerciseRoute.topic).toBe('lifestyle_risk_information');
    expect(exerciseRoute.primaryOperation).toBe('answer_general_health_question');

    const compat = checkPlanCompatibility({
      route: exerciseRoute,
      previousRoute: prepResult.dialogueRoute,
      previousPrimaryGoal: prepResult.conversationMemory.lastPrimaryGoal,
      previousRouteConfidence: prepResult.conversationMemory.lastRouteConfidence,
    });
    expect(compat.previousPlanDiscarded).toBe(true);
    expect(compat.reasons.join(' ')).toMatch(/new direct lifestyle-information question/i);

    const second = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: exerciseMessage,
      recentConversation: [
        { role: 'user', content: prepMessage },
        { role: 'assistant', content: prepResult.response },
      ],
      riskResult: risk,
      previousConversationMemory: prepResult.conversationMemory,
      previousAdaptiveState: prepResult.adaptiveState,
      previousDecisionState: prepResult.decisionState,
    });
    expect(second.dialogueRoute?.topic).toBe('lifestyle_risk_information');
    expect(second.routingDiagnostics?.previousPlanDiscarded).toBe(true);
    expect(second.response.toLowerCase()).not.toMatch(/patient[- ]?portal/);
    expect(second.response.toLowerCase()).not.toMatch(/next appointment|your appointment/);
    expect(second.response.toLowerCase()).toMatch(/exercise|lifestyle|health|physical activity/);
    expect(second.response.toLowerCase()).not.toMatch(/it is okay not to know/i);
  });

  it('3: provider error categories — classification timeout vs generation failure', async () => {
    expect(categorizeProviderError(new GroqRequestError('timeout', 't', { retryable: true }))).toBe(
      'timeout',
    );
    expect(
      categorizeProviderError(new GroqRequestError('authentication_error', 'a', { status: 401 })),
    ).toBe('authentication');
    expect(categorizeProviderError(new GroqRequestError('rate_limited', 'r', { status: 429 }))).toBe(
      'rate_limit',
    );
    expect(categorizeProviderError(new GroqRequestError('network_error', 'n', { retryable: true }))).toBe(
      'network',
    );

    const timeoutFetch = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const classification = await classifyAdaptiveState(
      envWithGroq,
      {
        latestMessage: 'Should I focus more on my exercise and health?',
        recentConversation: [],
        riskResult: risk,
      },
      timeoutFetch,
    );
    expect(classification.fallbackReason).toBe('classification_provider_failure');
    expect(classification.providerFailureStage).toBe('classification');
    expect(classification.providerErrorCategory).toBe('timeout');

    const generationFailFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 }),
    );
    const semantic = interpretSemanticTurnLocal({
      latestMessage: 'Should I focus more on my exercise and health?',
      riskResult: risk,
    });
    const generation = await generateDynamicResponse(
      envWithGroq,
      {
        latestMessage: 'Should I focus more on my exercise and health?',
        recentConversation: [],
        adaptiveState: {
          understanding: 'uncertain',
          emotion: 'uncertain',
          barrier: 'none',
          selfEfficacy: 'unknown',
          readiness: 'unclear',
          safetyFlag: 'none',
          confidence: 0.5,
        },
        strategy: 'clarify_risk',
        theoryConstruct: {
          theory: 'none',
          construct: 'none',
          communicationTechnique: 'none',
          objective: 'answer',
        },
        riskResult: risk,
        retrievedEvidence: [],
        recentAssistantMessages: [],
        semanticTurn: semantic,
      },
      generationFailFetch,
    );
    expect(generation.fallbackReason).toBe('generation_provider_failure');
    expect(generation.providerFailureStage).toBe('response_generation');
    expect(generation.providerErrorCategory).toBe('authentication');
  });

  it('4: screenshot-style portal/appointment fallback fails assumption validation', () => {
    const bad =
      'It is okay not to know exactly where to start. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?';
    const assumptions = validateAssumptions({
      reply: bad,
      conversationMemory: createDefaultConversationMemory(),
    });
    expect(assumptions.patientPortalAssumed).toBe(true);
    expect(assumptions.appointmentAssumed).toBe(true);
    expect(assumptions.unsupportedAssumptionDetected).toBe(true);
    expect(assumptions.valid).toBe(false);
  });

  it('5b: questions to ask the doctor lists questions, not a portal draft', async () => {
    const message = 'I would like some question i need to ask';
    const semantic = interpretSemanticTurnLocal({
      latestMessage: message,
      riskResult: risk,
      previousAssistantReply:
        "Got it—you're leaning toward a phone call. Would you like any tips on what questions to ask the doctor during that call?",
    });
    expect(semantic.topic).toBe('professional_interpretation');
    expect(semantic.primaryOperation).toBe('list_information');
    expect(semantic.explicitRequest.toLowerCase()).toMatch(/questions/);

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: message,
      recentConversation: [
        {
          role: 'assistant',
          content:
            "Got it—you're leaning toward a phone call. Would you like any tips on what questions to ask the doctor during that call?",
        },
      ],
      riskResult: risk,
    });
    expect(result.response.toLowerCase()).toMatch(/what does this estimate mean|questions?/i);
    expect(result.response.toLowerCase()).not.toMatch(/editable draft|portal message/);
    expect(result.dialogueRoute?.primaryOperation).toBe('list_information');
  });

  it('5h: spelling variants still select prepare-questions / clarify-number', async () => {
    const { detectDualChoiceSelection } = await import('../worker/dialogue/resolveContextualReply');
    const { normalizeUserText } = await import('../worker/dialogue/normalizeUserText');
    expect(normalizeUserText('yes preapre a quetsion')).toMatch(/prepare a question/);
    expect(detectDualChoiceSelection('yes preapre a quetsion')).toBe('prepare_questions');
    expect(detectDualChoiceSelection('clarfy the nuber')).toBe('clarify_number');
    expect(detectDualChoiceSelection('qestion for docter')).toBe('prepare_questions');
  });

  it('5g: yes prepare a quetsion advances to clinician questions (typo tolerant)', async () => {
    const { resolveContextualReply, detectDualChoiceSelection } = await import(
      '../worker/dialogue/resolveContextualReply'
    );
    const { generateLocalResponse } = await import('../worker/llm/localGenerator');
    const previous =
      'Just to be sure — would you like help clarifying the number itself, or preparing a question for a healthcare professional?';
    expect(detectDualChoiceSelection('yes prepare a quetsion')).toBe('prepare_questions');
    const contextual = resolveContextualReply('yes prepare a quetsion', undefined, previous);
    expect(contextual.requiresClarification).toBe(false);
    expect(contextual.resolvedMeaning ?? '').toMatch(/preparing questions/i);

    const reply = generateLocalResponse({
      strategy: 'ask_clarification',
      state: {
        understanding: 'uncertain',
        emotion: 'worried',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.7,
      },
      riskResult: risk,
      evidence: [],
      latestMessage: 'yes prepare a quetsion',
      recentAssistantMessages: [previous],
    });
    expect(reply.toLowerCase()).toMatch(/general questions|what does this estimate mean/);
    expect(reply.toLowerCase()).not.toMatch(/just to be sure/);
  });

  it('5f: yes after A-or-B offer asks which option, not a generic clarification', async () => {
    const { resolveContextualReply, detectDualChoiceOffer } = await import(
      '../worker/dialogue/resolveContextualReply'
    );
    const { generateLocalResponse } = await import('../worker/llm/localGenerator');
    const previous =
      'Feeling afraid that this means you currently have breast cancer is understandable. A demonstration risk estimate describes chance over time for people with similar calculator information — it is not a diagnosis of current cancer. Would it help next to look at what the number means, or at questions you could ask a professional?';
    expect(detectDualChoiceOffer(previous).isDualChoice).toBe(true);
    const contextual = resolveContextualReply('yes', undefined, previous);
    expect(contextual.requiresClarification).toBe(true);
    expect(contextual.kind).toBe('dual_choice_clarification');

    const reply = generateLocalResponse({
      strategy: 'ask_clarification',
      state: {
        understanding: 'uncertain',
        emotion: 'worried',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.7,
      },
      riskResult: risk,
      evidence: [],
      latestMessage: 'yes',
      recentAssistantMessages: [previous],
      dialogueTurnPlan: {
        primaryGoal: 'clarify_short_reply',
        mustAddress: [],
        mustNotAssume: [],
        unresolvedNeed: '',
        questionPurpose: 'clarification',
        nextPendingItem: { type: 'none' },
        dialogueAct: 'ask_clarification',
        shouldAskQuestion: true,
      } as never,
    });
    expect(reply.toLowerCase()).toMatch(/clarifying the number|preparing a question/);
    expect(reply.toLowerCase()).not.toMatch(/which part of the result you would like explained/);
  });

  it('5e: emotion fallback progresses when user names fear of having cancer', async () => {
    const { generateLocalResponse } = await import('../worker/llm/localGenerator');
    const previous =
      'It sounds like seeing this result has been worrying. What part of the result feels most concerning?';
    const reply = generateLocalResponse({
      strategy: 'acknowledge_emotion',
      state: {
        understanding: 'uncertain',
        emotion: 'worried',
        barrier: 'none',
        selfEfficacy: 'unknown',
        readiness: 'unclear',
        safetyFlag: 'none',
        confidence: 0.75,
      },
      riskResult: risk,
      evidence: [],
      latestMessage: 'I am afraid if i have a breastcancer',
      recentAssistantMessages: [previous],
    });
    expect(reply.toLowerCase()).toMatch(/afraid|fear|understandable/);
    expect(reply.toLowerCase()).toMatch(/not a diagnosis|probability/);
    expect(reply).not.toBe(previous);
    expect(reply.toLowerCase()).not.toMatch(/what part of the result feels most concerning/);
  });

  it('5d: clinician question-list reply passes generation validation limits', async () => {
    const { validateGeneratedReply } = await import('../worker/safety/validateResponse');
    const detailed =
      'Here are more detailed general questions people often ask a healthcare professional about a demonstration risk estimate. What does this estimate mean for me personally? Which parts of my personal or family history matter most here? Are any follow-up discussions or tests appropriate for my situation? How should I use this demonstration result alongside screening or other care already in place? What should I watch for or ask about next? These are general preparation ideas, not a personalized care plan.';
    expect(validateGeneratedReply(detailed).valid).toBe(false);
    expect(
      validateGeneratedReply(detailed, { maxWords: 220, maxQuestions: 8 }).valid,
    ).toBe(true);
  });

  it('5c: detailed clinician-question request expands explanations', async () => {
    const message = 'can you give list of question for doctor but provide indetail';
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(semantic.primaryOperation).toBe('list_information');
    expect(semantic.requestedFormat).toMatch(/detailed/i);

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: message,
      recentConversation: [],
      riskResult: risk,
    });
    expect(result.response.toLowerCase()).toMatch(/personally|family history|follow-up|watch for/);
    expect(result.response.toLowerCase()).toMatch(/helps|clarifies|keeps|supports|translate/);
    expect(result.response.toLowerCase()).not.toMatch(/editable draft/);
  });

  it('5a: asking a doctor about diagnosis/tests is preparation, not avatar safety boundary', async () => {
    const messages = [
      'I want to ask doctor for diagnosis',
      'i want to ask the doctor what test are needed for diagnosis',
      'can you give questions related to which diagnosis test i should perform with doctor',
    ];
    for (const message of messages) {
      const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
      expect(semantic.requiresSafetyBoundary).toBe(false);
      expect(semantic.topic).not.toBe('safety');
      expect(['list_information', 'provide_preparation_information']).toContain(semantic.primaryOperation);

      const result = await orchestrateDialogueTurn(envNoGroq, {
        latestMessage: message,
        recentConversation: [],
        riskResult: risk,
      });
      expect(result.response.toLowerCase()).not.toMatch(
        /i cannot diagnose conditions or recommend treatment/,
      );
      expect(result.response.toLowerCase()).toMatch(/question|estimate|history|prepar|professional|test/);
    }
  });

  it('6b: explain demonstration risk uses number-aware fallback, not generic menu', async () => {
    const message = 'explain demonstration risk';
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(semantic.topic).toBe('risk_meaning');

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: message,
      recentConversation: [
        {
          role: 'assistant',
          content:
            'I can help explain the demonstration risk estimate, general next-step options, or sample questions for a healthcare professional. What would be most useful right now?',
        },
      ],
      riskResult: risk,
    });

    expect(result.response).toMatch(/probability|not a diagnosis/i);
    expect(result.response).toMatch(new RegExp(String(risk.fiveYearRisk)));
    expect(result.response).not.toMatch(/what would be most useful right now/i);
    expect(result.dialogueStrategy).toBe('clarify_risk');
  });

  it('6: fallback answers which-doctor / who-to-contact accurately without Groq', async () => {
    const message = 'which doctor should i reach out to';
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(semantic.barrier).toBe('access');
    expect(semantic.primaryOperation).toBe('address_barrier');
    expect(semantic.topic).not.toBe('unclear');
    expect(semantic.directAnswerRequired).toBe(true);

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: message,
      recentConversation: [
        { role: 'user', content: 'okay bye' },
        {
          role: 'assistant',
          content: 'You are welcome. I am glad that helped. You can return anytime if another question comes up.',
        },
      ],
      riskResult: risk,
      previousAdaptiveState: {
        understanding: 'correct',
        emotion: 'worried',
        barrier: 'fear',
        selfEfficacy: 'moderate',
        readiness: 'considering',
        safetyFlag: 'none',
        confidence: 0.7,
      },
    });

    expect(result.adaptiveState.barrier).toBe('access');
    expect(result.dialogueStrategy).toBe('explore_barrier');
    expect(result.response.toLowerCase()).toMatch(/primary care|gynecologist|specialist|clinician/);
    expect(result.response).toMatch(/cannot name a specific doctor/i);
    expect(result.response).not.toMatch(/how do you currently feel about discussing/i);
    expect(result.response).not.toMatch(/would it help to clarify the number itself/i);
    expect(result.response).not.toMatch(/thank you for sharing that update/i);
    expect(result.responseMode).toMatch(/local|fallback/i);
  });

  it('5: classification invalid JSON / empty generation preserve latestMessage and stage', async () => {
    const message = 'Should I focus more on my exercise and health?';
    const invalidJsonFetch = vi.fn().mockResolvedValue(
      new Response('not-json{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const classification = await classifyAdaptiveState(
      envWithGroq,
      { latestMessage: message, recentConversation: [], riskResult: risk },
      invalidJsonFetch,
    );
    expect(classification.providerFailureStage).toBe('classification');
    expect(['invalid_response', 'schema_validation', 'unknown']).toContain(
      classification.providerErrorCategory,
    );

    const emptyFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }),
    );
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    const generation = await generateDynamicResponse(
      envWithGroq,
      {
        latestMessage: message,
        recentConversation: [],
        adaptiveState: {
          understanding: 'uncertain',
          emotion: 'uncertain',
          barrier: 'none',
          selfEfficacy: 'unknown',
          readiness: 'unclear',
          safetyFlag: 'none',
          confidence: 0.5,
        },
        strategy: 'clarify_risk',
        theoryConstruct: {
          theory: 'none',
          construct: 'none',
          communicationTechnique: 'none',
          objective: 'answer',
        },
        riskResult: risk,
        retrievedEvidence: [],
        recentAssistantMessages: [],
        semanticTurn: semantic,
      },
      emptyFetch,
    );
    expect(generation.providerFailureStage).toBe('response_generation');
    expect(generation.reply.toLowerCase()).toMatch(/exercise|lifestyle|health|physical activity/);
    expect(JSON.stringify(generation)).not.toMatch(/sk-test-key/);
  });
});
