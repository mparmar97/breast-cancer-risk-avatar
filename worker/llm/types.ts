/** Shared Phase 5 pipeline types — see docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md. */

export type ClassificationMode = 'groq-structured' | 'local-fallback' | 'local-safety-precheck';

export type ResponseMode = 'groq-dynamic-rag' | 'local-rag-fallback' | 'fixed-safety';

/**
 * Safe, developer-only reasons a fallback path was used. Never derived
 * from a raw provider error message/body — always one of this closed set.
 */
export type FallbackReason =
  | 'missing_configuration'
  | 'classification_provider_failure'
  | 'classification_validation_failure'
  | 'generation_provider_failure'
  | 'generation_validation_failure'
  | 'repetition_failure'
  | 'insufficient_evidence';

/** Pipeline stage where a provider call failed (sanitized; never a raw message). */
export type ProviderFailureStage =
  | 'classification'
  | 'response_generation'
  | 'response_repair'
  | 'repair'
  | 'unknown'
  | 'none';

/**
 * Closed, sanitized provider error categories for developer diagnostics.
 * Never derived from raw provider error bodies.
 */
export type ProviderErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'model_unavailable'
  | 'invalid_request'
  | 'invalid_structured_output'
  | 'schema_validation'
  | 'empty_response'
  | 'provider_error'
  | 'invalid_response'
  | 'missing_configuration'
  | 'unknown';

export interface ProviderExecution {
  providerFailureStage?: ProviderFailureStage;
  providerErrorCategory?: ProviderErrorCategory;
  classificationFailureStage?: ProviderFailureStage;
  generationFailureStage?: ProviderFailureStage;
  classificationErrorCategory?: ProviderErrorCategory;
  generationErrorCategory?: ProviderErrorCategory;
  /** Closed local validation reason when generation_validation_failure occurs. */
  generationValidationReason?: string;
  retriesUsed?: number;
}

/**
 * Categories where local generation fallback is allowed.
 * Prefer groq-dynamic-rag for every turn; only fall back when Groq is
 * unreachable / rate-limited / unconfigured (or auth-blocked).
 */
export function isInfrastructureGenerationFallback(
  category: ProviderErrorCategory | undefined,
): boolean {
  return (
    category === 'rate_limit' ||
    category === 'network' ||
    category === 'timeout' ||
    category === 'missing_configuration' ||
    category === 'authentication' ||
    category === 'authorization' ||
    // Upstream 5xx / generic provider outage — no usable Groq reply.
    category === 'provider_error'
  );
}
