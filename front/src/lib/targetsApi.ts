import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;
const cfg = { withCredentials: true };

export interface TargetProgress {
  target: {
    id: string;
    metric: string;
    period_type: string;
    period_start: string;
    target_value: number;
  };
  current_value: number;
  progress_pct: number;
  period_label: string;
}

export async function getMyProgress(): Promise<TargetProgress[]> {
  const r = await axios.get(`${base}/targets/my-progress`, cfg);
  return r.data;
}
