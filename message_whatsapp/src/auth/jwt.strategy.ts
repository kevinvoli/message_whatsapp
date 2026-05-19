import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommercialPlanning } from 'src/commercial-group/entities/commercial-planning.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {
    super({
      jwtFromRequest: (req: any) => {
        if (req?.cookies?.['Authentication']) {
          return req.cookies['Authentication'];
        }
        const authHeader = req?.headers?.['authorization'];
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          return authHeader.slice(7);
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
    }).format(new Date());

    const [commercial, planning] = await Promise.all([
      this.commercialRepo.findOne({
        where: { id: payload.sub },
        select: ['id', 'isWorkingToday'],
      }),
      this.planningRepo.findOne({
        where: { commercialId: payload.sub, date: today },
      }),
    ]);

    const effectivePosteId =
      planning?.type === 'exceptional' && planning.overridePosteId
        ? planning.overridePosteId
        : payload.posteId;

    return {
      userId:         payload.sub,
      email:          payload.email,
      posteId:        effectivePosteId,
      isWorkingToday: commercial?.isWorkingToday ?? false,
      absentToday:    planning?.type === 'absence',
      isReplacing:    planning?.type === 'exceptional' && !!planning.overridePosteId,
    };
  }
}
