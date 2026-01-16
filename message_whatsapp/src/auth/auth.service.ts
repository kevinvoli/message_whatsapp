
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: WhatsappCommercialService,
    private jwtService: JwtService,
  ) {}

 async validateUser(email: string, pass: string ): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user) {
        // Si l'utilisateur a un mot de passe et que le mot de passe fourni n'est pas vide
        if (user.password && pass) {
            const isMatch = await bcrypt.compare(pass, user.password);
            if (isMatch) {
                const { password, ...result } = user;
                return result;
            }
            // Si le mot de passe ne correspond pas, retournez null
            return null;
        }
        // Si l'utilisateur n'a pas de mot de passe (ou si aucun mot de passe n'a été fourni), retournez l'utilisateur sans le mot de passe
        const { password, ...result } = user;
        return result;
    }
    return null;
}

  async login(user: WhatsappCommercial) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user:user
    };
  }
}
