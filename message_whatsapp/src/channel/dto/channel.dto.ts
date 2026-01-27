

export class WhapiUser {
    id: string;

  name: string;

  is_business: boolean;

  profile_pic: string;

  saved: boolean;
}

export class WhapiStatus {
  code: number;

  text: string;
}


export class WhapiChannel {
  id: string;

  channel_id: string;
 
  token: string;

  start_at: number;

  uptime: number;

  status: WhapiStatus;

  version: string;

  user: WhapiUser;

  device_id: number;

  ip: string;

  is_business: boolean;

  api_version: string;
  
  core_version: string;
}


