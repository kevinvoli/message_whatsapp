import { IsEmail } from "class-validator";

export class CreateGoogleLoginDto{
  @IsEmail()
  email: string
}