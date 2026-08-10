import { describe, expect, it } from 'vitest';
import { buildSessionCsv, flattenDeveloperFields } from '../../src/services/download';
import type { ChatDiagnostics, SessionData } from '../../src/types';
import { SESSION_ANALYSIS_NOTES } from '../../src/types';

const sampleDiagnostics = {
  adaptiveState: {
    understanding: 'correct',
    emotion: 'worried',
    barrier: 'fear',
    selfEfficacy: 'moderate',
    readiness: 'considering',
    safetyFlag: 'none',
    confidence: 0.8,
  },
  strategy: 'acknowledge_emotion',
  responseMode: 'groq-dynamic-rag',
  classificationMode: 'local-fallback',
  fallbackReason: undefined,
  theoryConstruct: {
    theory: 'Motivational Interviewing communication principles',
    construct: 'reflective listening',
    communicationTechnique: 'reflection',
    objective: 'acknowledge emotion',
    sourceIds: [],
    citations: [],
  },
  providerExecution: {
    generationErrorCategory: 'rate_limit',
  },
  usedEvidenceIds: ['nci-1'],
  sources: [{ id: 'nci-1', title: 'Example source' }],
} as unknown as ChatDiagnostics;

describe('flattenDeveloperFields', () => {
  it('flattens nested developer diagnostics paths', () => {
    const rows = flattenDeveloperFields(sampleDiagnostics);
    const byField = Object.fromEntries(rows.map((row) => [row.field, row.value]));
    expect(byField['adaptiveState.emotion']).toBe('worried');
    expect(byField.strategy).toBe('acknowledge_emotion');
    expect(byField['providerExecution.generationErrorCategory']).toBe('rate_limit');
    expect(byField.usedEvidenceIds).toBe('nci-1');
  });
});

describe('buildSessionCsv', () => {
  it('includes transcript and developer diagnostic rows', () => {
    const session: SessionData = {
      consentGiven: true,
      screen: 'chat',
      riskResult: {
        model: 'Simplified Educational Risk Form',
        fiveYearRisk: 3.2,
        riskHorizon: '5 years',
        riskBranch: 'elevated',
        disclaimer: 'demo',
      },
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'I am worried',
          timestamp: '2026-08-07T12:00:00.000Z',
        },
        {
          id: 'a1',
          role: 'assistant',
          content: 'That makes sense.',
          timestamp: '2026-08-07T12:00:05.000Z',
          diagnostics: sampleDiagnostics,
        },
      ],
      latestDiagnostics: sampleDiagnostics,
      createdAt: '2026-08-07T11:59:00.000Z',
      updatedAt: '2026-08-07T12:00:05.000Z',
      conversationStartedAt: '2026-08-07T11:59:30.000Z',
    };

    const csv = buildSessionCsv(session);
    expect(csv).toContain('row_type,message_id,timestamp');
    expect(csv).toContain('session,');
    expect(csv).toContain('message,u1,');
    expect(csv).toContain('I am worried');
    expect(csv).toContain('developer_json,a1,');
    expect(csv).toContain('developer,a1,');
    expect(csv).toContain('adaptiveState.emotion');
    expect(csv).toContain('worried');
    expect(csv).toContain('responseMode');
    expect(csv).toContain('groq-dynamic-rag');
    expect(csv).toContain(SESSION_ANALYSIS_NOTES.slice(0, 40));
  });
});
