import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {
    super({
      jwtFromRequest: (req: any) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['Authentication'];
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const commercial = await this.commercialRepo.findOne({
      where: { id: payload.sub as string },
      select: ['id', 'tokenVersion'],
    });

    if (!commercial || commercial.tokenVersion !== (payload.tokenVersion as number)) {
      throw new UnauthorizedException('Session invalide — veuillez vous reconnecter.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      posteId: payload.posteId,
    };
  }
}
