export type BaseAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthUser = BaseAuthUser & {
  posteId?: string | null;
};

export type AuthAdminUser = BaseAuthUser;

export type JwtBasePayload = {
  sub: string;
  email: string;
  name: string;
};

export type JwtCommercialPayload = JwtBasePayload & {
  posteId: string | null;
};

export type JwtAdminPayload = JwtBasePayload;

export type CommercialAuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
  posteId: string | null;
  isWorkingToday: boolean;
  absentToday: boolean;
  isReplacing: boolean;
};

export type AdminAuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
};
