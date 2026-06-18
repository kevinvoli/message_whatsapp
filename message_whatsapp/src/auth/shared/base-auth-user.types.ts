export type BaseAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthUser = BaseAuthUser & {
  posteId?: string | null;
  tokenVersion: number;
};

export type AuthAdminUser = BaseAuthUser;
