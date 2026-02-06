// src/auth_admin/auth_admin.controller.ts
import { Controller, Post, Body, UseGuards, Request, Get, UnauthorizedException, Res } from '@nestjs/common';
import { AuthAdminService } from './auth_admin.service';
import { LoginAdminDto } from './dto/login_admin.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express'; // Import Response from express

@Controller('auth/admin')
export class AuthAdminController {
  constructor(private authAdminService: AuthAdminService) {}

  @Post('login')
  async login(@Body() loginAdminDto: LoginAdminDto, @Res({ passthrough: true }) res: Response) {
    const admin = await this.authAdminService.validateAdmin(
      loginAdminDto.email,
      loginAdminDto.password,
    );

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.authAdminService.login(admin); // Get both tokens

    res.cookie('AuthenticationAdmin', accessToken, {
      httpOnly: true,
      maxAge: 15 * 60 * 1000, // 15 minutes for access token
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    res.cookie('RefreshAdmin', refreshToken, { // Set refresh token cookie
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { admin }; // Return admin object without the token in the body
  }

  @UseGuards(AuthGuard('jwt-admin'))
  @Get('profile')
  async getProfile(@Request() req) {
    const admin = await this.authAdminService.getProfile(req.user.userId);
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    return admin;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt-admin'))
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('AuthenticationAdmin');
    res.clearCookie('RefreshAdmin'); // Clear refresh token cookie
    return { message: 'Successfully logged out as admin' };
  }
}
