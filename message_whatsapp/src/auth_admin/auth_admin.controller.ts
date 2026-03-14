import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Patch,
  UnauthorizedException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { AuthAdminService } from './auth_admin.service';
import { AdminService } from '../admin/admin.service';
import { LoginDto } from '../auth/shared/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Controller('auth/admin')
export class AuthAdminController {
  constructor(
    private authAdminService: AuthAdminService,
    private adminService: AdminService,
  ) {}

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
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

  @UseGuards(AuthGuard('jwt-admin'))
  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() body: { name?: string; email?: string },
  ) {
    if (!body.name && !body.email) {
      throw new BadRequestException('name or email is required');
    }
    const admin = await this.adminService.findOneByEmail(req.user.email);
    if (!admin) throw new UnauthorizedException('Admin not found');

    const updated = await this.adminService.updateProfile(
      admin.id,
      body.name ?? admin.name,
      body.email ?? admin.email,
    );
    return { id: updated.id, name: updated.name, email: updated.email };
  }

  @UseGuards(AuthGuard('jwt-admin'))
  @Patch('password')
  async updatePassword(
    @Request() req,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    const admin = await this.adminService.findOneByEmail(req.user.email);
    if (!admin) throw new UnauthorizedException('Admin not found');

    try {
      await this.adminService.updatePassword(admin.id, body.currentPassword, body.newPassword);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Erreur lors du changement de mot de passe');
    }
    return { message: 'Mot de passe modifié avec succès' };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt-admin'))
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('AuthenticationAdmin');
    res.clearCookie('RefreshAdmin');
    return { message: 'Successfully logged out as admin' };
  }
}
