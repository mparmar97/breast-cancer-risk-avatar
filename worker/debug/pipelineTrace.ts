/**
 * Per-turn pipeline stage markers for developer diagnostics.
 * Never includes API keys, authorization headers, or hidden prompts.
 */

export type PipelineStageName =
  | 'turn_request'
  | 'safety'
  | 'classification'
  | 'routing'
  | 'theory'
  | 'planning'
  | 'retrieval'
  | 'generation'
  | 'validation'
  | 'assumption_validation'
  | 'fallback'
  | 'complete';

export interface PipelineStageMark {
  stage: PipelineStageName | string;
  latestMessagePresent: boolean;
  at: string;
}

/**
 * Structured propagation + provider attempt trace for the developer panel.
 */
export interface PipelineTrace {
  turnId: string;

  requestReceived: boolean;
  latestMessagePresentAtBoundary: boolean;

  latestMessagePresentAtSafety: boolean;
  latestMessagePresentAtClassification: boolean;
  latestMessagePresentAtRouting: boolean;
  latestMessagePresentAtPlanning: boolean;
  latestMessagePresentAtGeneration: boolean;
  latestMessagePresentAtValidation: boolean;

  classificationProviderAttempted: boolean;
  classificationProviderSucceeded: boolean;

  generationProviderAttempted: boolean;
  generationProviderSucceeded: boolean;

  classificationFallbackUsed: boolean;
  generationFallbackUsed: boolean;

  failedStage?: string;
  providerErrorCategory?: string;

  /** Ordered stage marks (supplementary; boolean flags above are primary). */
  stages: PipelineStageMark[];
}

export function createPipelineTrace(turnId: string, latestMessagePresent = true): PipelineTrace {
  return {
    turnId,
    requestReceived: true,
    latestMessagePresentAtBoundary: latestMessagePresent,
    latestMessagePresentAtSafety: false,
    latestMessagePresentAtClassification: false,
    latestMessagePresentAtRouting: false,
    latestMessagePresentAtPlanning: false,
    latestMessagePresentAtGeneration: false,
    latestMessagePresentAtValidation: false,
    classificationProviderAttempted: false,
    classificationProviderSucceeded: false,
    generationProviderAttempted: false,
    generationProviderSucceeded: false,
    classificationFallbackUsed: false,
    generationFallbackUsed: false,
    stages: [],
  };
}

function applyStageFlag(trace: PipelineTrace, stage: string, present: boolean): void {
  switch (stage) {
    case 'turn_request':
    case 'boundary':
      trace.latestMessagePresentAtBoundary = present;
      break;
    case 'safety':
      trace.latestMessagePresentAtSafety = present;
      break;
    case 'classification':
      trace.latestMessagePresentAtClassification = present;
      break;
    case 'routing':
      trace.latestMessagePresentAtRouting = present;
      break;
    case 'planning':
    case 'theory':
    case 'retrieval':
      trace.latestMessagePresentAtPlanning = present;
      break;
    case 'generation':
    case 'fallback':
      trace.latestMessagePresentAtGeneration = present;
      break;
    case 'validation':
    case 'assumption_validation':
      trace.latestMessagePresentAtValidation = present;
      break;
    default:
      break;
  }
  if (!present && !trace.failedStage) {
    trace.failedStage = stage;
  }
}

export function markStage(
  trace: PipelineTrace,
  stage: PipelineStageName | string,
  present: boolean,
): PipelineTrace {
  applyStageFlag(trace, stage, present);
  trace.stages.push({
    stage,
    latestMessagePresent: present,
    at: new Date().toISOString(),
  });
  return trace;
}

export function markClassificationAttempt(
  trace: PipelineTrace,
  input: { attempted: boolean; succeeded: boolean; fallbackUsed: boolean; errorCategory?: string },
): void {
  trace.classificationProviderAttempted = input.attempted;
  trace.classificationProviderSucceeded = input.succeeded;
  trace.classificationFallbackUsed = input.fallbackUsed;
  if (!input.succeeded && input.errorCategory) {
    trace.providerErrorCategory = input.errorCategory;
    if (!trace.failedStage) trace.failedStage = 'classification';
  }
}

export function markGenerationAttempt(
  trace: PipelineTrace,
  input: { attempted: boolean; succeeded: boolean; fallbackUsed: boolean; errorCategory?: string },
): void {
  trace.generationProviderAttempted = input.attempted;
  trace.generationProviderSucceeded = input.succeeded;
  trace.generationFallbackUsed = input.fallbackUsed;
  if (!input.succeeded && input.errorCategory) {
    trace.providerErrorCategory = input.errorCategory;
    if (!trace.failedStage) trace.failedStage = 'response_generation';
  }
}
