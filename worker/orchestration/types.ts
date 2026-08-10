import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState } from '../behavioral/state';
import type { StateTransitionMetadata } from '../behavioral/transitionState';
import type { TheoryConstruct } from '../behavioral/theoryMap';
import type {
  DecisionSupportState,
  DecisionSupportStrategy,
  DecisionSupportTurnPlan,
  DecisionTransitionMetadata,
} from '../decisionSupport/types';
import type { ConversationMemory } from '../dialogue/conversationMemory';
import type { RequestInterpretation } from '../dialogue/currentTurnInterpretation';
import type { ResponsePlan } from '../dialogue/deriveResponsePlan';
import type {
  AssistantDialogueAct,
  CurrentTurnInterpretation,
  DialogueTurnPlan,
  PendingConversationItem,
} from '../dialogue/types';
import type { ResolvedShortReply } from '../dialogue/resolveShortReply';
import type { OperationValidation } from '../dialogue/validateOperationFulfillment';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import type { PipelineTrace } from '../debug/pipelineTrace';
import type { MetadataConsistency } from '../debug/validateMetadataConsistency';
import type { AssumptionValidation } from '../dialogue/validateAssumptions';
import type {
  ClassificationMode,
  FallbackReason,
  ProviderExecution,
  ResponseMode,
} from '../llm/types';
import type { TurnRequest } from '../request/turnRequest';
import type { RetrievedEvidence } from '../rag/types';
import type {
  DialogueRoute,
  PlanCompatibilityResult,
  RouteFulfillmentValidation,
  RouteValidation,
  RoutingDiagnostics,
} from '../routing/types';
import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { RiskResult } from '../types';
import type { InnovationMetadata } from './innovationMetadata';
import type { OrchestrationValidation } from './validateOrchestration';

/** Alias used in orchestration documentation and API metadata. */
export type AdaptiveStateTransitionMetadata = StateTransitionMetadata;

export interface OrchestrationInput {
  latestMessage: string;
  recentConversation: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  riskResult: RiskResult;
  /** When provided, latestMessage must match turnRequest.latestMessage. */
  turnRequest?: TurnRequest;
  previousAdaptiveState?: AdaptiveState;
  previousDecisionState?: DecisionSupportState;
  previousConversationMemory?: ConversationMemory;
  previousStrategy?: DialogueStrategy;
  previousAssistantDialogueAct?: AssistantDialogueAct;
  pendingConversationItem?: PendingConversationItem;
  /** Recent dialogue strategies for stagnation detection (most-recent last). */
  recentStrategies?: DialogueStrategy[];
  barrierUnmentionedTurns?: number;
}

export interface OrchestrationResult {
  currentTurnInterpretation: CurrentTurnInterpretation;
  /** Topic + requested-operation interpretation (separate from adaptive classification). */
  requestInterpretation: RequestInterpretation;
  semanticTurn?: SemanticTurn;
  responsePlan?: ResponsePlan;
  dialogueRoute?: DialogueRoute;
  routeValidation?: RouteValidation;
  planCompatibility?: PlanCompatibilityResult;
  routeFulfillment?: RouteFulfillmentValidation;
  routingDiagnostics?: RoutingDiagnostics;
  adaptiveState: AdaptiveState;
  adaptiveTransition: AdaptiveStateTransitionMetadata;
  resolvedShortReply: ResolvedShortReply;

  decisionState: DecisionSupportState;
  decisionTransition: DecisionTransitionMetadata;
  conversationMemory: ConversationMemory;
  previousConversationMemory: ConversationMemory;

  dialogueStrategy: DialogueStrategy;
  theoryConstruct: TheoryConstruct;

  decisionSupportStrategy: DecisionSupportStrategy;
  decisionSupportTheoryConstruct: TheoryConstruct;
  dialogueTurnPlan: DialogueTurnPlan;
  decisionSupportTurnPlan: DecisionSupportTurnPlan;

  retrievalQuery: string;
  retrievedEvidence: RetrievedEvidence[];
  calculationResult: NaturalFrequencyResult | null;

  response: string;
  usedEvidenceIds: string[];
  initialGeneratedResponse: string | null;
  repairedResponse: string | null;
  operationValidation: OperationValidation;
  operationRepairAttempted: boolean;

  classificationMode: ClassificationMode | string;
  responseMode: ResponseMode | string;
  classificationConsistency: string;
  classificationRepairUsed: boolean;
  fallbackReason?: FallbackReason;

  safetyOverrideApplied: boolean;
  repetitionDetected: boolean;
  regenerationUsed: boolean;
  fallbackUsed: boolean;
  similarityScore: number;
  repeatedDialogueMove: string | null;

  dialogueAdvanced: boolean;
  primaryGoalSatisfied: boolean;
  decisionNeedAddressed: boolean;

  strategyRepeated: boolean;
  strategyProgressionApplied: boolean;
  unsupportedAssumptionDetected: boolean;
  resolvedIssueRepeated: boolean;
  directQuestionAnswered: boolean;
  practicalRequestFulfilled: boolean;
  userCorrectionHandled: boolean;
  repeatedExplanationDetected: boolean;
  shortReplyResolved: boolean;
  resolvedMeaning: string | null;

  orchestrationValidation: OrchestrationValidation;
  innovationMetadata: InnovationMetadata;

  finalPrimaryIntent: string;
  secondaryIntents: string[];
  groqModel: string;
  recentStrategies: DialogueStrategy[];
  dialogueDesignSourceIds: string[];

  turnRequest?: TurnRequest;
  pipelineTrace?: PipelineTrace;
  providerExecution?: ProviderExecution;
  assumptionValidation?: AssumptionValidation;
  metadataConsistency?: MetadataConsistency;
}
