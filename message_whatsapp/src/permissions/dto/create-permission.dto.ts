import { IsNotEmpty, IsString } from "class-validator";
import { Action } from "../entities/permission.entity";

export class CreatePermissionDto {
  @IsNotEmpty()
  action: Action;

  @IsNotEmpty()
  resource: string;

  @IsNotEmpty()
  conditions: Record<string, any>;
  
  isAdmin: boolean
}
