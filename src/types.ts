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

export interface SessionData {
  consentGiven: boolean;
  screen: Screen;
  riskResult: RiskResult | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
