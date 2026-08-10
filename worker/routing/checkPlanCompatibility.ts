/**
 * Verifies whether a previous response plan/goal may still be reused.
 */

import type { ResponsePlan } from '../dialogue/deriveResponsePlan';
import type { DialogueRoute, PlanCompatibilityResult } from './types';

export interface CheckPlanCompatibilityInput {
  route: DialogueRoute;
  previousPlan?: Pick<ResponsePlan, 'primaryGoal' | 'topic' | 'primaryOperation'> | null;
  previousRoute?: DialogueRoute | null;
  previousPrimaryGoal?: string | null;
  /** Prior route confidence when available (low-confidence plans should be discarded). */
  previousRouteConfidence?: number | null;
  previousFallbackUsed?: boolean;
}

function topicCompatible(route: DialogueRoute, previous?: DialogueRoute | null): boolean {
  if (!previous) return false;
  if (previous.topic === route.topic) return true;
  // Allow risk_meaning ↔ risk_representation only when still in conversion/verify family.
  if (
    (previous.topic === 'risk_meaning' || previous.topic === 'risk_representation') &&
    (route.topic === 'risk_meaning' || route.topic === 'risk_representation') &&
    (route.primaryOperation === 'convert' ||
      route.primaryOperation === 'verify_understanding' ||
      route.primaryOperation === 'explain')
  ) {
    return true;
  }
  return false;
}

function operationCompatible(route: DialogueRoute, previous?: DialogueRoute | null): boolean {
  if (!previous) return false;
  return previous.primaryOperation === route.primaryOperation;
}

function discard(reasons: string[]): PlanCompatibilityResult {
  return {
    compatible: false,
    reasons,
    reason: reasons.join('; '),
    previousPlanDiscarded: true,
  };
}

/**
 * Discard previous plan when the user asks something new, changes barrier,
 * corrects, confirms understanding, changes topic, defers, or answers a pending item.
 */
export function checkPlanCompatibility(input: CheckPlanCompatibilityInput): PlanCompatibilityResult {
  const {
    route,
    previousRoute,
    previousPlan,
    previousPrimaryGoal,
    previousRouteConfidence,
    previousFallbackUsed,
  } = input;

  if (!previousRoute && !previousPlan && !previousPrimaryGoal) {
    return { compatible: true, reasons: [], previousPlanDiscarded: false };
  }

  if (
    route.topic === 'lifestyle_risk_information' ||
    route.primaryOperation === 'answer_general_health_question'
  ) {
    if (
      previousRoute?.topic === 'professional_interpretation' ||
      previousRoute?.primaryOperation === 'provide_preparation_information' ||
      previousRoute?.primaryOperation === 'provide_options' ||
      previousPrimaryGoal?.includes('preparation') ||
      previousPrimaryGoal?.includes('next_step')
    ) {
      return discard(['new direct lifestyle-information question']);
    }
  }

  const previousLowConfidence =
    typeof previousRouteConfidence === 'number' && previousRouteConfidence < 0.7;
  if (
    previousRoute?.topic === 'unclear' ||
    previousRoute?.primaryOperation === 'request_clarification' ||
    previousPrimaryGoal?.includes('clarif') ||
    (previousFallbackUsed && previousLowConfidence) ||
    (previousLowConfidence && route.directAnswerRequired && route.topic !== 'unclear')
  ) {
    if (route.directAnswerRequired && route.topic !== 'unclear') {
      return discard(['previous plan from low-confidence fallback / unclear']);
    }
  }

  if (route.primaryOperation === 'set_boundary' || route.safetyBoundaryRequired) {
    return discard(['safety or screening boundary replaces prior plan']);
  }

  if (route.primaryOperation === 'address_barrier') {
    if (
      previousRoute?.primaryOperation !== 'address_barrier' ||
      previousRoute.barrier !== route.barrier ||
      previousRoute.topic !== route.topic
    ) {
      return discard(['new or different practical barrier']);
    }
  }

  if (route.primaryOperation === 'correct_misunderstanding') {
    return discard(['user correction / misunderstanding']);
  }

  if (route.primaryOperation === 'verify_understanding') {
    if (previousRoute?.primaryOperation !== 'verify_understanding') {
      return discard(['understanding confirmation replaces prior explanation plan']);
    }
  }

  if (route.primaryOperation === 'defer' || route.primaryOperation === 'reject') {
    return discard(['user deferred action']);
  }

  if (route.primaryOperation === 'convert') {
    if (
      previousRoute?.primaryOperation === 'address_barrier' ||
      previousPrimaryGoal?.includes('barrier') ||
      previousPrimaryGoal?.includes('readiness')
    ) {
      return discard(['natural-frequency request replaces barrier/readiness plan']);
    }
  }

  if (
    previousPrimaryGoal?.includes('natural frequency') &&
    route.primaryOperation === 'address_barrier'
  ) {
    return discard(['work-schedule barrier must not reuse natural-frequency plan']);
  }

  if (
    (previousPrimaryGoal?.includes('action') || previousRoute?.primaryOperation === 'plan') &&
    route.topic === 'screening_guidance'
  ) {
    return discard(['screening question must not reuse action-planning plan']);
  }

  const reasons: string[] = [];

  if (previousRoute && !topicCompatible(route, previousRoute)) {
    reasons.push(`topic changed from ${previousRoute.topic} to ${route.topic}`);
  }

  if (previousRoute && !operationCompatible(route, previousRoute)) {
    reasons.push(
      `operation changed from ${previousRoute.primaryOperation} to ${route.primaryOperation}`,
    );
  }

  if (
    previousPlan?.primaryGoal &&
    route.directAnswerRequired &&
    previousRoute &&
    previousRoute.explicitRequest !== route.explicitRequest &&
    previousRoute.primaryOperation !== route.primaryOperation
  ) {
    reasons.push('new direct request');
  }

  if (reasons.length > 0) {
    return discard(reasons);
  }

  return { compatible: true, reasons: [], previousPlanDiscarded: false };
}
