
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';


@Injectable()
export class AuthService {
  constructor(
    private usersService: WhatsappCommercialService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string | null): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && pass && await bcrypt.compare(pass, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    if(user && !pass){
        const { password, ...result } = user;
        return result;
    }
    return null;
  }

  async login(user: WhatsappCommercial) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
