import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  UnauthorizedException,
  Res,
} from '@nestjs/common';
import { AuthAdminService } from './auth_admin.service';
import { LoginDto } from '../auth/shared/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Controller('auth/admin')
export class AuthAdminController {
  constructor(private authAdminService: AuthAdminService) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = await this.authAdminService.validate(
      loginDto.email,
      loginDto.password,
    );

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.authAdminService.login(admin);

    res.cookie('AuthenticationAdmin', accessToken, {
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    res.cookie('RefreshAdmin', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { admin };
  }

  @UseGuards(AuthGuard('jwt-admin'))
  @Get('profile')
  async getProfile(@Request() req) {
    const admin = await this.authAdminService.getProfile(req.user.email);
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    return admin;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt-admin'))
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('AuthenticationAdmin');
    res.clearCookie('RefreshAdmin');
    return { message: 'Successfully logged out as admin' };
  }
}
