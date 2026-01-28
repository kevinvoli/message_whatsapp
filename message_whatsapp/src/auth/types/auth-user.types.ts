export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  posteId?: string | null;
};