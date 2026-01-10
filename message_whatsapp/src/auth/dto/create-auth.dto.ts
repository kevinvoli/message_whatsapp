import { IsString } from "class-validator";

export class CreateAuthDto {
  @IsString()
  mail: string;
  @IsString()
  password: string;
}
