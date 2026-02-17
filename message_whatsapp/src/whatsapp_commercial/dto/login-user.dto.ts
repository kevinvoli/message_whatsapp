import { IsString } from 'class-validator';

export class LoginUserDto {
  @IsString()
  name: string;
}
