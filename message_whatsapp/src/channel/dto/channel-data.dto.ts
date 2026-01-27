
 export class ChanneDatalDto {
  start_at: number;
  uptime: number;
  status: { code: number, text: string };
  version: string;
  user: {
    id: string;
    name: string;
    is_business: boolean;
    profile_pic: string;
    saved: boolean
  };
  device_id: number;
  ip: string;
  is_business: boolean;
  channel_id: string;
  api_version: string;
  core_version: string
}