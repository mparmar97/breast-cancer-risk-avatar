import type { DecisionSupportStrategy } from './types';
import type { TheoryConstruct } from '../behavioral/theoryMap';

/**
 * Explicit theory constructs for decision-support strategies. ODSF-inspired
 * constructs determine the communication objective, not a fixed sentence.
 */
export function getDecisionSupportTheoryConstruct(strategy: DecisionSupportStrategy): TheoryConstruct {
  switch (strategy) {
    case 'provide_information':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'missing information',
        communicationTechnique: 'plain-language gist and absolute risk framing',
        objective: 'supply the information needed to interpret the demonstration result',
        sourceIds: ['REYNA-FTT-2008'],
      };
    case 'clarify_options':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'unclear options',
        communicationTechnique: 'neutral option listing without prescribing a medical decision',
        objective: 'help the user see non-clinical communication options they may choose',
      };
    case 'clarify_preferences':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'unclear preferences',
        communicationTechnique: 'preference-sensitive open question',
        objective: 'help the user clarify which optional approach fits them',
      };
    case 'build_confidence':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'low decision confidence',
        communicationTechnique: 'manageable next-step framing',
        objective: 'support confidence without coercing a medical choice',
      };
    case 'prepare_questions':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'insufficient support / preparation for shared decision-making',
        communicationTechnique: 'editable draft or question preparation',
        objective: 'help the user prepare to communicate with a healthcare professional',
      };
    case 'address_barrier':
      return {
        theory: 'Ottawa Decision Support Framework / Health Belief Model',
        construct: 'practical barriers',
        communicationTechnique: 'barrier-specific optional alternative',
        objective: 'identify and work around a practical obstacle without judgment',
        sourceIds: ['MERCADO-ECA-MI-2023'],
      };
    case 'acknowledge_emotion_need':
      return {
        theory: 'Ottawa Decision Support Framework / Motivational Interviewing',
        construct: 'emotional barriers',
        communicationTechnique: 'brief reflective acknowledgment with autonomy support',
        objective: 'acknowledge emotion without replacing a primary practical request',
        sourceIds: ['MERCADO-ECA-MI-2023'],
      };
    case 'support_deferral':
      return {
        theory: 'Ottawa Decision Support Framework / Motivational Interviewing',
        construct: 'autonomy and decision deferral',
        communicationTechnique: 'non-coercive permission to wait',
        objective: 'respect a deferred decision without pressure',
        sourceIds: ['MERCADO-ECA-MI-2023'],
      };
    case 'confirm_selected_action':
      return {
        theory: 'Ottawa Decision Support Framework / readiness-to-change',
        construct: 'action intention confirmed',
        communicationTechnique: 'brief confirmation without re-asking timing',
        objective: 'recognize a confirmed action commitment',
      };
    case 'review_draft':
      return {
        theory: 'Ottawa Decision Support Framework',
        construct: 'preparation for shared decision-making',
        communicationTechnique: 'direct draft review',
        objective: 'confirm whether communication wording is clear',
      };
    case 'close_decision':
      return {
        theory: 'Motivational Interviewing communication principles',
        construct: 'autonomy support',
        communicationTechnique: 'supportive closing',
        objective: 'close without opening new decisional pressure',
        sourceIds: ['MERCADO-ECA-MI-2023'],
      };
    default:
      return {
        theory: 'none',
        construct: 'none',
        communicationTechnique: 'none',
        objective: 'no decision-support objective this turn',
      };
  }
}
