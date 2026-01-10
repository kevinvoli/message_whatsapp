import { IsInt } from "class-validator";

export class CreateRolePermissionDto {
  @IsInt()
    roleId: number;
  
    @IsInt()
    permissionId: number;
}
