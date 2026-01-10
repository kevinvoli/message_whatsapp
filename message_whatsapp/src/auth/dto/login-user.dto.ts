import { IsNotEmpty, Length } from "class-validator";

export class LoginUserDto {
    @Length(5,30)
    @IsNotEmpty()
    email: string

    @IsNotEmpty()
    @Length(1,50)
    password: string;
}