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

export type JwtCommercialPayload = {
  sub: string;
  email: string;
  name: string;
  posteId?: string | null;
  tokenVersion: number;
  iat: number;
  exp: number;
};
