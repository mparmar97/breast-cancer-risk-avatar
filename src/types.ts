export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

export type Screen = 'consent' | 'calculator' | 'chat';

export type RiskBranch = 'average' | 'elevated';

export interface RiskResult {
  model: string;
  fiveYearRisk: number;
  riskHorizon: string;
  riskBranch: RiskBranch;
  disclaimer: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

// --- Adaptive Readiness-to-Action Dialogue Engine types (Phase 3) ---------
//
// These mirror worker/behavioral/state.ts, worker/behavioral/policy.ts, and
// worker/behavioral/theoryMap.ts. They describe temporary, conversational-
// turn estimates only, and must never be presented as a diagnosis of any
// kind. They are shown only in the developer-only diagnostic panel.

export type Understanding = 'correct' | 'partial' | 'incorrect' | 'uncertain';

export type Emotion = 'calm' | 'worried' | 'overwhelmed' | 'dismissive' | 'uncertain';

export type Barrier =
  | 'none'
  | 'fear'
  | 'time'
  | 'cost'
  | 'access'
  | 'mistrust'
  | 'uncertainty'
  | 'other';

export type SelfEfficacy = 'low' | 'moderate' | 'high' | 'unknown';

export type Readiness = 'not_considering' | 'considering' | 'preparing' | 'ready' | 'unclear';

export type SafetyFlag =
  | 'none'
  | 'diagnosis_request'
  | 'treatment_request'
  | 'urgent_symptom'
  | 'emotional_crisis'
  | 'out_of_scope';

export interface AdaptiveState {
  understanding: Understanding;
  emotion: Emotion;
  barrier: Barrier;
  selfEfficacy: SelfEfficacy;
  readiness: Readiness;
  safetyFlag: SafetyFlag;
  confidence: number;
}

export type DialogueStrategy =
  | 'safety_boundary'
  | 'urgent_referral'
  | 'clarify_risk'
  | 'acknowledge_emotion'
  | 'explain_benefit'
  | 'explore_barrier'
  | 'support_self_efficacy'
  | 'action_planning'
  | 'explore_readiness';

export interface TheoryConstruct {
  theory: string;
  construct: string;
  communicationTechnique: string;
  objective: string;
  /** Dialogue-design source IDs/citations backing this strategy's technique — design rationale only, never medical support. */
  sourceIds?: string[];
  citations?: string[];
}

export type ResponseMode = 'local-fallback' | 'local-rag-fallback';

// --- Local RAG evidence types (Phase 4/4b) --------------------------------
//
// Mirrors worker/rag/types.ts. `medical-rag` sources are the only kind
// returned in `sources` and are the sole factual basis for a chat reply.
// `dialogue-design` sources (returned only in `dialogueDesignSources`, for
// developer diagnostics) justify behavioral-theory/communication-technique
// choices and must never be treated as medical support. See
// docs/EVIDENCE_REGISTER.md. Only non-sensitive source metadata is ever
// sent to the frontend; raw evidence text never leaves the worker.

export type EvidenceStatus = 'demo-placeholder' | 'vetted';

export type EvidenceUse = 'medical-rag' | 'dialogue-design';

export type EvidenceSourceType =
  | 'official-calculator-documentation'
  | 'government-patient-education'
  | 'clinical-guideline'
  | 'primary-research'
  | 'theory-paper'
  | 'systematic-review';

export interface SourceMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  section: string;
  topic: string;
  score: number;
  status: EvidenceStatus;
  sourceUse: EvidenceUse;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  clinicalUseRestriction?: string;
  researchLimitation?: string;
}

export interface DialogueDesignMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  topic: string;
  status: EvidenceStatus;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  researchLimitation?: string;
}

export interface ChatDiagnostics {
  adaptiveState: AdaptiveState;
  strategy: DialogueStrategy;
  theoryConstruct: TheoryConstruct;
  retrievalQuery: string;
  sources: SourceMetadata[];
  dialogueDesignSources: DialogueDesignMetadata[];
  responseMode: ResponseMode;
}

export interface ChatApiResponse extends ChatDiagnostics {
  reply: string;
  timestamp: string;
}

export interface SessionData {
  consentGiven: boolean;
  screen: Screen;
  riskResult: RiskResult | null;
  messages: ChatMessage[];
  /** Diagnostics from the most recent assistant reply, for the developer panel only. */
  latestDiagnostics: ChatDiagnostics | null;
  createdAt: string;
  updatedAt: string;
}
