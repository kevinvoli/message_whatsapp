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
import { AuthService } from './auth.service';
import { LoginDto } from './shared/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly connectionLogService: ConnectionLogService,
  ) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validate(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.authService.login(user);

    // Log connexion commercial
    void this.connectionLogService.logLogin(user.id, 'commercial');

    res.cookie('Authentication', accessToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { user, accessToken };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req) {
    const user = await this.authService.getProfile(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Log déconnexion commercial
    void this.connectionLogService.logLogout(req.user.userId, 'commercial');

    res.clearCookie('Authentication');
    res.clearCookie('Refresh');
    return { message: 'Successfully logged out' };
  }
}
