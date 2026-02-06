
import { Controller, Post, Body, UseGuards, Request, Get, UnauthorizedException, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express'; // Import Response from express

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const user = await this.authService.validateUser(
    loginDto.email,
    loginDto.password,
  );

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  const { accessToken, refreshToken } = this.authService.login(user);
  
  res.cookie('Authentication', accessToken, {
    httpOnly: true,
    maxAge: 15 * 60 * 1000, // 15 minutes for access token
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  res.cookie('Refresh', refreshToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return { user };
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
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('Authentication');
    res.clearCookie('Refresh'); // Clear refresh token cookie
    return { message: 'Successfully logged out' };
  }
}
