/**
 * Detects unsupported portal / appointment / clinician assumptions in replies.
 */

import type { ConversationMemory } from './conversationMemory';

export interface AssumptionValidation {
  /** Spec aliases */
  patientPortalAssumed: boolean;
  appointmentAssumed: boolean;
  clinicianRelationshipAssumed: boolean;
  selectedActionInvented: boolean;
  unsupportedPersonalizationDetected: boolean;
  unsupportedAssumptionDetected: boolean;

  /** Legacy / panel fields (same meaning as aliases above). */
  portalAssumedWithoutMemory: boolean;
  appointmentAssumedWithoutMemory: boolean;
  clinicianRelationshipAssumedWithoutMemory: boolean;
  valid: boolean;
  failedAssumptions: string[];
  repairAttempted: boolean;
}

export interface ValidateAssumptionsInput {
  reply: string;
  conversationMemory?: ConversationMemory | null;
  repairAttempted?: boolean;
}

/** Assumes established portal access (not a hedged optional suggestion). */
const PORTAL_ASSUMPTION =
  /\b(your)\s+(patient[- ]?)?portal\b|\b(open|use|via|through|log(?:ging)? in to|sending a|send a)\s+(your |the )?(patient[- ]?)?portal\b|\b(patient[- ]?portal)\s+(message|note|inbox)\b|\bopen your patient[- ]?portal\b/i;
/** Assumes a concrete appointment / existing visit the user already has. */
const APPOINTMENT_ASSUMPTION =
  /\b(your|the|next|upcoming)\s+appointment\b|\bschedule(d)? (an |your )?appointment\b|\bat (your|the) (next |existing )?visit\b|\bat an existing visit\b/i;
/** Assumes an established clinician relationship ("your doctor"), not a general professional. */
const CLINICIAN_RELATIONSHIP_ASSUMPTION =
  /\byour\s+(doctor|clinician|physician|oncologist|provider)\b|\bask your (doctor|clinician|physician|provider)\b/i;
/** Invents an action the user never selected (e.g. "since you chose to message"). */
const SELECTED_ACTION_INVENTED =
  /\b(since you (chose|selected|picked|decided)|you (already )?(chose|selected|picked)|as you (requested|agreed) to)\b/i;

function memoryEstablishesPortal(memory?: ConversationMemory | null): boolean {
  if (!memory) return false;
  if (memory.draftStatus !== 'none') return true;
  if (memory.selectedCommunicationOption && /portal|written|message/i.test(memory.selectedCommunicationOption)) {
    return true;
  }
  if (memory.selectedOptions.some((o) => /portal|written|message/i.test(o))) return true;
  if (memory.currentDraft || memory.acceptedDraft || memory.acceptedDraftText) return true;
  return false;
}

function memoryEstablishesAppointment(memory?: ConversationMemory | null): boolean {
  if (!memory) return false;
  if (memory.plannedTiming) return true;
  if (memory.plannedAction && /appointment|visit|schedule/i.test(memory.plannedAction)) return true;
  if (memory.userPreferences.some((p) => /appointment|visit/i.test(p))) return true;
  return false;
}

function memoryEstablishesClinician(memory?: ConversationMemory | null): boolean {
  if (!memory) return false;
  if (memory.selectedCommunicationOption && /doctor|clinician|physician|provider|clinic/i.test(memory.selectedCommunicationOption)) {
    return true;
  }
  if (memory.selectedOptions.some((o) => /doctor|clinician|physician|provider|clinic/i.test(o))) {
    return true;
  }
  if (memory.plannedAction && /doctor|clinician|physician|provider|clinic/i.test(memory.plannedAction)) {
    return true;
  }
  return false;
}

/**
 * Validates that a final reply does not assume portal access, an appointment,
 * or an established clinician relationship unless conversation memory supports it.
 */
export function validateAssumptions(input: ValidateAssumptionsInput): AssumptionValidation {
  const { reply, conversationMemory, repairAttempted = false } = input;
  const failedAssumptions: string[] = [];

  const portalAssumed = PORTAL_ASSUMPTION.test(reply) && !memoryEstablishesPortal(conversationMemory);
  const appointmentAssumed =
    APPOINTMENT_ASSUMPTION.test(reply) && !memoryEstablishesAppointment(conversationMemory);
  const clinicianAssumed =
    CLINICIAN_RELATIONSHIP_ASSUMPTION.test(reply) && !memoryEstablishesClinician(conversationMemory);
  const selectedActionInvented = SELECTED_ACTION_INVENTED.test(reply);
  const unsupportedPersonalizationDetected =
    /\b(your (personal )?(exercise|diet|workout) (plan|program)|i recommend you (exercise|start|do)|you should (exercise|work out) \d+)\b/i.test(
      reply,
    );

  if (portalAssumed) failedAssumptions.push('portal access assumed without established memory');
  if (appointmentAssumed) failedAssumptions.push('appointment assumed without established memory');
  if (clinicianAssumed) {
    failedAssumptions.push('clinician relationship assumed without established memory');
  }
  if (selectedActionInvented) failedAssumptions.push('selected action invented without user choice');
  if (unsupportedPersonalizationDetected) {
    failedAssumptions.push('unsupported personalization detected');
  }

  const unsupportedAssumptionDetected = failedAssumptions.length > 0;

  return {
    patientPortalAssumed: portalAssumed,
    appointmentAssumed,
    clinicianRelationshipAssumed: clinicianAssumed,
    selectedActionInvented,
    unsupportedPersonalizationDetected,
    unsupportedAssumptionDetected,
    portalAssumedWithoutMemory: portalAssumed,
    appointmentAssumedWithoutMemory: appointmentAssumed,
    clinicianRelationshipAssumedWithoutMemory: clinicianAssumed,
    valid: !unsupportedAssumptionDetected,
    failedAssumptions,
    repairAttempted,
  };
}

export function buildAssumptionRepairInstruction(validation: AssumptionValidation): string {
  const parts = [
    'Revise the reply so it does not assume facts not established in conversation memory.',
  ];
  if (validation.portalAssumedWithoutMemory) {
    parts.push('Do not mention a patient portal or assume portal access.');
  }
  if (validation.appointmentAssumedWithoutMemory) {
    parts.push('Do not mention a next appointment or existing visit.');
  }
  if (validation.clinicianRelationshipAssumedWithoutMemory) {
    parts.push(
      'Do not refer to "your doctor/clinician" as an established relationship; use general wording such as a qualified healthcare professional when needed.',
    );
  }
  return parts.join(' ');
}
