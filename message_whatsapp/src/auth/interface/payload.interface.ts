export interface JwtPayload {
  id: number;
  email: string;
  name?: string;
  roleId?: number;
  role?:string;
}

export interface PayloadInterface {
  id:number, 
  email:string
}