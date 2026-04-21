import { API_BASE_URL } from './_http';

export interface AiModuleConfig {
  module_name: string;
  label: string;
  is_enabled: boolean;
  fallback_text: string | null;
  requires_human_validation: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  allowed_roles: string[] | null;
  allowed_channels: string[] | null;
  security_rules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateModuleConfigDto {
  is_enabled?: boolean;
  fallback_text?: string | null;
  requires_human_validation?: boolean;
  schedule_start?: string | null;
  schedule_end?: string | null;
}

export interface AiExecutionLog {
  id: string;
  module_name: string;
  scenario: string | null;
  triggered_by: string | null;
  chat_id: string | null;
  success: boolean;
  latency_ms: number;
  fallback_used: boolean;
  human_validation_used: boolean;
  error_message: string | null;
  tokens_used: number | null;
  createdAt: string;
}

export interface AiModuleStats {
  module_name: string;
  label: string;
  is_enabled: boolean;
  total: number;
  success_rate: number;
  fallback_rate: number;
  avg_latency_ms: number;
}

export interface AiDashboard {
  total_executions: number;
  success_rate: number;
  fallback_rate: number;
  avg_latency_ms: number;
  modules: AiModuleStats[];
}

const BASE = `${API_BASE_URL}/ai/governance`;

export async function getAiModules(): Promise<AiModuleConfig[]> {
  const res = await fetch(`${BASE}/modules`, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement modules IA');
  return res.json() as Promise<AiModuleConfig[]>;
}

export async function updateAiModule(name: string, dto: UpdateModuleConfigDto): Promise<AiModuleConfig> {
  const res = await fetch(`${BASE}/modules/${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error('Erreur mise à jour module IA');
  return res.json() as Promise<AiModuleConfig>;
}

export async function getAiLogs(page = 1, limit = 50, module?: string): Promise<{ items: AiExecutionLog[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (module) params.set('module', module);
  const res = await fetch(`${BASE}/logs?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement journaux IA');
  return res.json() as Promise<{ items: AiExecutionLog[]; total: number }>;
}

export async function getAiDashboard(since?: string): Promise<AiDashboard> {
  const url = since ? `${BASE}/dashboard?since=${since}` : `${BASE}/dashboard`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement dashboard IA');
  return res.json() as Promise<AiDashboard>;
}

export interface QualityAnalysis {
  quality_score: number;
  strengths: string[];
  improvements: string[];
  coaching_tips: string[];
}

export async function analyzeConversationQuality(chatId: string): Promise<QualityAnalysis> {
  const res = await fetch(`${API_BASE_URL}/ai/quality/${chatId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Erreur analyse qualité');
  return res.json() as Promise<QualityAnalysis>;
}
