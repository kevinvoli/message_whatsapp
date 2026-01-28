import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { SafeWhatsappCommercial } from 'src/whatsapp_commercial/dto/safe-whatsapp-commercial';
import { AuthUser } from './types/auth-user.types';

@Injectable()
export class AuthService {
  constructor(
    private usersService: WhatsappCommercialService,
    private jwtService: JwtService,
  ) {}

  private toSafeUser(user: WhatsappCommercial): SafeWhatsappCommercial {
    const {
      password,
      passwordResetToken,
      passwordResetExpires,
      salt,
      ...safe
    } = user;

    return safe;
  }

  async validateUser(email: string, pass: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOneByEmailWithPassword(email);

    if (!user) return null;

    const isValid = await user.validatePassword(pass);
    if (!isValid) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      posteId: user.poste?.id ?? null,
    };
  }

  login(user: AuthUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      posteId: user.posteId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
