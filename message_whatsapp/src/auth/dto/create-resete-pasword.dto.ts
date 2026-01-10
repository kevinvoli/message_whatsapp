import { IsEmail, IsNotEmpty } from "class-validator";

export class CreateResetePasswordDto{
  @IsEmail()
  readonly email:string;
  @IsNotEmpty()
  readonly password:string;

  @IsNotEmpty()
  readonly code : string
}