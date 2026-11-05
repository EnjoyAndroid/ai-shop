import type { SupportUi } from '../ui';
export interface EvalProductPreview { name: string; priceCny: number; stock: number; description: string; }
export type EvalMode = 'prompt' | 'full';
export type EvalSide = 'A' | 'B';
export type EvalVersion = 'baseline' | 'current';
export type EvalVote = EvalSide | 'tie' | 'neither';
export interface EvalHistory { id: string; userText: string; answerText: string | null; }
export interface EvalCall {
  phase: 'scope' | 'answer'; sequence: number; latencyMs: number; success: boolean; errorCode?: string;
  inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null;
  costCny: number | null; reservedCny: number; responseModel: string | null; requestedTools: number;
}
export interface EvalResult {
  answer: string; rawAnswer?: string; ui?: SupportUi; productPreviews?: EvalProductPreview[]; status: string; latencyMs: number; calls: EvalCall[];
  tools: Array<{ name: string; arguments: unknown; result: unknown }>;
  inputTokens: number | null; outputTokens: number | null; costCny: number | null;
  reservedCny: number; modelCalls: number; toolCalls: number; toolExecutions: number;
}
export interface EvalTurn { id: string; question: string; results: Record<EvalSide, EvalResult>; vote?: EvalVote; ratedBlind?: boolean; }
export interface EvalSession {
  id: string; adminId: string; createdAt: string; expiresAt: string; mode: EvalMode; scenario: string;
  model: string; wireApi: string; configHash: string; revision: string; budgetCny: number;
  assignment: Record<EvalSide, EvalVersion>; revealed: boolean; turns: EvalTurn[];
}
export interface EvalSessionView {
  id: string; createdAt: string; expiresAt: string; mode: EvalMode; scenario: string; model: string; wireApi: string;
  budgetCny: number; revealed: boolean; restartRequired: boolean; versions?: Record<EvalSide, string>; turns: EvalTurn[];
  spentCny: number; heldCny: number; pending: boolean;
}
