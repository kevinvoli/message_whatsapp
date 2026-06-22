export interface ReplySuggestion {
  text: string;
  rationale: string;
}

export type RewriteMode = 'correct' | 'improve' | 'formal' | 'short';

export interface RewriteResult {
  result: string;
}

export interface AiSummaryResult {
  summary: string;
}

export interface AiQualifyResult {
  outcome: string;
  interest: string;
  objection: string | null;
}
