export type AssignmentDecision =
  | { type: 'KEEP_CURRENT_AGENT'; agentId: string }
  | { type: 'ASSIGN_NEW_AGENT'; agentId: string }
  | { type: 'PENDING' };
