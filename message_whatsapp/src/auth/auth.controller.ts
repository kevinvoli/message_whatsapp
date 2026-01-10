import { Body, ClassSerializerInterceptor, Controller, Post, Res, UseGuards, UseInterceptors, Request, Get, Param, Delete, Query, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { LoginUserDto } from './dto/login-user.dto';
 
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {

  constructor(private readonly authService: AuthService) { }

  @Post('/login')
  async login(@Body() user: LoginUserDto) {

    const result = await this.authService.login(user);

    return result
  }

  @UseInterceptors(ClassSerializerInterceptor)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) respons: Response) {
    respons.clearCookie('jwt')

    const result = await this.authService.logout(req.user.id)
    return result
  }

@UseGuards(JwtAuthGuard)
  @Post('validate')
  async validateToken(@Request() req) {
    // Si le JwtAuthGuard a validé le token, on retourne simplement l'utilisateur
    return {
      user: req.user,
      valid: true
    };
  }


  @UseInterceptors(ClassSerializerInterceptor)
  @UseGuards(JwtAuthGuard)

  @Delete('delete')
  async deleteAccount(@Request() req,) {

    return req?.user
  }

}

