import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;

export type GateStatus = 'allow' | 'warn' | 'block' | 'redirect_to_task';

export interface BlockingItem {
  code:    string;
  label:   string;
  count:   number;
  action?: string;
}

export interface GateResult {
  status:       GateStatus;
  primaryCode:  string | null;
  primaryLabel: string | null;
  blockers:     BlockingItem[];
  warnings:     BlockingItem[];
  checkedAt:    string;
}

export async function getGateStatus(): Promise<GateResult> {
  const r = await axios.get(`${base}/commercial-action-gate/status`, { withCredentials: true });
  return r.data;
}
