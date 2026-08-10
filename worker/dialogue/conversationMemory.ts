/**
 * Persistent conversational bookkeeping as semantic facts, not scripted stages.
 * Legacy fields are retained for API/frontend compatibility and derived from facts.
 */

import {
  NO_PENDING_ITEM,
  type AssistantDialogueAct,
  type PendingConversationItem,
} from './types';

export type RiskExplanationStatus =
  | 'not_discussed'
  | 'explained'
  | 'partially_understood'
  | 'understood';

export type ConversationDraftStatus =
  | 'none'
  | 'requested'
  | 'proposed'
  | 'revision_requested'
  | 'accepted'
  | 'rejected'
  | 'saved';

export type ConversationActionStatus =
  | 'none'
  | 'considering'
  | 'prepared'
  | 'planned'
  | 'confirmed'
  | 'completed'
  | 'deferred'
  | 'rejected';

export interface ConversationMemory {
  /** Semantic fact memory (preferred). */
  understoodConcepts: string[];
  misunderstoodConcepts: string[];
  answeredQuestions: string[];
  unresolvedQuestions: string[];

  activeTopic?: string;
  activeReferencedObject?: string;

  selectedOptions: string[];
  rejectedOptions: string[];

  draftStatus: ConversationDraftStatus;
  currentDraft?: string;
  draftConstraints: string[];

  actionStatus: ConversationActionStatus;
  plannedAction?: string;
  plannedTiming?: string;

  userPreferences: string[];
  /** Preferred name for the active barrier. */
  activeBarrier?: string;
  resolvedBarriers: string[];

  acceptedDraft?: string;
  /** Active practical barrier from the latest turn, when expressed. */
  currentBarrier?: string;
  /** Short context for the active barrier (e.g. calling during work). */
  currentBarrierContext?: string;
  /** Prior turn route summary for stale-plan detection. */
  lastRouteTopic?: string;
  lastRouteOperation?: string;
  lastRouteExplicitRequest?: string;
  lastRouteConfidence?: number;
  lastFallbackUsed?: boolean;
  lastPrimaryGoal?: string;
  pendingQuestion?: {
    purpose: string;
    referencedObject?: string;
  };
  recentDialogueActs: string[];

  /** Legacy compatibility fields (synced with semantic facts). */
  riskExplanationStatus: RiskExplanationStatus;
  currentTopic?: string;
  unresolvedNeed?: string;
  selectedCommunicationOption?: string;
  rejectedCommunicationOptions: string[];
  acceptedDraftText?: string;
  lastAssistantDialogueAct?: AssistantDialogueAct;
  pendingConversationItem?: PendingConversationItem;
  resolvedIssues: string[];
}

export function createDefaultConversationMemory(): ConversationMemory {
  return {
    understoodConcepts: [],
    misunderstoodConcepts: [],
    answeredQuestions: [],
    unresolvedQuestions: [],
    selectedOptions: [],
    rejectedOptions: [],
    draftConstraints: [],
    userPreferences: [],
    resolvedBarriers: [],
    recentDialogueActs: [],
    riskExplanationStatus: 'not_discussed',
    rejectedCommunicationOptions: [],
    draftStatus: 'none',
    actionStatus: 'none',
    resolvedIssues: [],
    pendingConversationItem: NO_PENDING_ITEM,
    lastAssistantDialogueAct: 'none',
  };
}

const RISK_STATUS_VALUES: readonly RiskExplanationStatus[] = [
  'not_discussed',
  'explained',
  'partially_understood',
  'understood',
];

const DRAFT_STATUS_VALUES: readonly ConversationDraftStatus[] = [
  'none',
  'requested',
  'proposed',
  'revision_requested',
  'accepted',
  'rejected',
  'saved',
];

const ACTION_STATUS_VALUES: readonly ConversationActionStatus[] = [
  'none',
  'considering',
  'prepared',
  'planned',
  'confirmed',
  'completed',
  'deferred',
  'rejected',
];

function isRiskStatus(value: unknown): value is RiskExplanationStatus {
  return typeof value === 'string' && (RISK_STATUS_VALUES as readonly string[]).includes(value);
}

function isDraftStatus(value: unknown): value is ConversationDraftStatus {
  return typeof value === 'string' && (DRAFT_STATUS_VALUES as readonly string[]).includes(value);
}

function isActionStatus(value: unknown): value is ConversationActionStatus {
  return typeof value === 'string' && (ACTION_STATUS_VALUES as readonly string[]).includes(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Normalizes client-supplied or older-session memory into a safe shape.
 */
export function normalizeConversationMemory(
  value: Partial<ConversationMemory> | null | undefined,
): ConversationMemory {
  const defaults = createDefaultConversationMemory();
  if (!value || typeof value !== 'object') return defaults;

  const selectedOptions = stringArray(value.selectedOptions);
  const rejectedOptions = stringArray(value.rejectedOptions);
  const understoodConcepts = stringArray(value.understoodConcepts);
  const resolvedIssues = stringArray(value.resolvedIssues);

  const selectedCommunicationOption =
    typeof value.selectedCommunicationOption === 'string'
      ? value.selectedCommunicationOption
      : selectedOptions[0];

  const acceptedDraft =
    typeof value.acceptedDraft === 'string'
      ? value.acceptedDraft
      : typeof value.acceptedDraftText === 'string'
        ? value.acceptedDraftText
        : undefined;

  let riskExplanationStatus = isRiskStatus(value.riskExplanationStatus)
    ? value.riskExplanationStatus
    : defaults.riskExplanationStatus;
  if (understoodConcepts.includes('risk_explanation')) {
    riskExplanationStatus = 'understood';
  }

  const activeBarrier =
    typeof value.activeBarrier === 'string'
      ? value.activeBarrier
      : typeof value.currentBarrier === 'string'
        ? value.currentBarrier
        : undefined;

  const currentDraft =
    typeof value.currentDraft === 'string'
      ? value.currentDraft
      : acceptedDraft;

  return {
    understoodConcepts,
    misunderstoodConcepts: stringArray(value.misunderstoodConcepts),
    answeredQuestions: stringArray(value.answeredQuestions),
    unresolvedQuestions: stringArray(value.unresolvedQuestions),
    activeTopic:
      typeof value.activeTopic === 'string'
        ? value.activeTopic
        : typeof value.currentTopic === 'string'
          ? value.currentTopic
          : undefined,
    activeReferencedObject:
      typeof value.activeReferencedObject === 'string' ? value.activeReferencedObject : undefined,
    selectedOptions:
      selectedOptions.length > 0
        ? selectedOptions
        : selectedCommunicationOption
          ? [selectedCommunicationOption]
          : [],
    rejectedOptions:
      rejectedOptions.length > 0
        ? rejectedOptions
        : stringArray(value.rejectedCommunicationOptions),
    acceptedDraft,
    currentDraft,
    draftConstraints: stringArray(value.draftConstraints),
    actionStatus: isActionStatus(value.actionStatus) ? value.actionStatus : defaults.actionStatus,
    plannedAction: typeof value.plannedAction === 'string' ? value.plannedAction : undefined,
    plannedTiming: typeof value.plannedTiming === 'string' ? value.plannedTiming : undefined,
    userPreferences: stringArray(value.userPreferences),
    activeBarrier,
    resolvedBarriers: stringArray(value.resolvedBarriers),
    currentBarrier: activeBarrier,
    currentBarrierContext:
      typeof value.currentBarrierContext === 'string' ? value.currentBarrierContext : undefined,
    lastRouteTopic: typeof value.lastRouteTopic === 'string' ? value.lastRouteTopic : undefined,
    lastRouteOperation:
      typeof value.lastRouteOperation === 'string' ? value.lastRouteOperation : undefined,
    lastRouteExplicitRequest:
      typeof value.lastRouteExplicitRequest === 'string'
        ? value.lastRouteExplicitRequest
        : undefined,
    lastRouteConfidence:
      typeof value.lastRouteConfidence === 'number' ? value.lastRouteConfidence : undefined,
    lastFallbackUsed: typeof value.lastFallbackUsed === 'boolean' ? value.lastFallbackUsed : undefined,
    lastPrimaryGoal: typeof value.lastPrimaryGoal === 'string' ? value.lastPrimaryGoal : undefined,
    pendingQuestion:
      value.pendingQuestion && typeof value.pendingQuestion === 'object'
        ? {
            purpose: String((value.pendingQuestion as { purpose?: string }).purpose ?? ''),
            referencedObject: (value.pendingQuestion as { referencedObject?: string }).referencedObject,
          }
        : undefined,
    recentDialogueActs: stringArray(value.recentDialogueActs),
    riskExplanationStatus,
    currentTopic:
      typeof value.currentTopic === 'string'
        ? value.currentTopic
        : typeof value.activeTopic === 'string'
          ? value.activeTopic
          : undefined,
    unresolvedNeed: typeof value.unresolvedNeed === 'string' ? value.unresolvedNeed : undefined,
    selectedCommunicationOption,
    rejectedCommunicationOptions:
      rejectedOptions.length > 0
        ? rejectedOptions
        : stringArray(value.rejectedCommunicationOptions),
    draftStatus: isDraftStatus(value.draftStatus) ? value.draftStatus : defaults.draftStatus,
    acceptedDraftText: acceptedDraft,
    lastAssistantDialogueAct:
      typeof value.lastAssistantDialogueAct === 'string'
        ? (value.lastAssistantDialogueAct as AssistantDialogueAct)
        : defaults.lastAssistantDialogueAct,
    pendingConversationItem:
      value.pendingConversationItem && typeof value.pendingConversationItem === 'object'
        ? value.pendingConversationItem
        : defaults.pendingConversationItem,
    resolvedIssues:
      resolvedIssues.length > 0
        ? resolvedIssues
        : understoodConcepts.includes('risk_explanation')
          ? ['risk_explanation']
          : [],
  };
}
