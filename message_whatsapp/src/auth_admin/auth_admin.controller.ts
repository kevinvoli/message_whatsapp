// src/auth_admin/auth_admin.controller.ts
import { Controller, Post, Body, UseGuards, Request, Get, UnauthorizedException } from '@nestjs/common';
import { AuthAdminService } from './auth_admin.service';
import { LoginAdminDto } from './dto/login_admin.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth/admin')
export class AuthAdminController {
  constructor(private authAdminService: AuthAdminService) {}

  @Post('login')
  async login(@Body() loginAdminDto: LoginAdminDto) {
    const admin = await this.authAdminService.validateAdmin(
      loginAdminDto.email,
      loginAdminDto.password,
    );

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.authAdminService.login(admin);
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
}
