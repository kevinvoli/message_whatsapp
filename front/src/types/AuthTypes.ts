
// authTypes.ts
export type User = {
  id?: number;
  name: string;
  phoneNumber?: string;
  address?: string;
  emergencyContacts?: Contact[];
  email: string;
  roleId: number;
  password: string;
  cni?: string;
  status: 'active' | 'inactive';
  role?: Roles;
  clients?: CLients[];
  orders?: Order[];
  solde?: number;
  reseteSoldeDate?: string;

};

export type LoginResponse = {
  message: string;
  token: string;
  refreshToken?:string
  user: User;
};

export type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  // refreshUser: () => Promise<void>;

};