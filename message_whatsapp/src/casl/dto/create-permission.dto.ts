import { IsEnum, IsOptional, IsString, IsObject, IsNotEmpty } from 'class-validator';
import { Action } from '../entities/permission.entity';

export class CreatePermissionDto {
  @IsNotEmpty()
  @IsString()
  module: string;

  @IsEnum(Action)
  @IsNotEmpty()
  action: Action;

  @IsOptional()
  @IsObject()
  conditions?: object | null;
}