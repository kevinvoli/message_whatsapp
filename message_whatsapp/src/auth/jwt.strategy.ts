import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommercialPlanning } from 'src/commercial-group/entities/commercial-planning.entity';
import { GroupScheduleDay } from 'src/commercial-group/entities/group-schedule-day.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Request } from 'express';
import {
  CommercialAuthenticatedUser,
  JwtCommercialPayload,
} from './shared/base-auth-user.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,
    @InjectRepository(GroupScheduleDay)
    private readonly scheduleDayRepo: Repository<GroupScheduleDay>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
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

  async validate(payload: JwtCommercialPayload): Promise<CommercialAuthenticatedUser> {
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
    }).format(new Date());

    const [commercial, planning] = await Promise.all([
      this.commercialRepo.findOne({
        where: { id: payload.sub },
        select: ['id', 'groupId'],
      }),
      this.planningRepo.findOne({
        where: { commercialId: payload.sub, date: today },
      }),
    ]);

    // Absence déclarée → hors service, pas de remplacement
    if (planning?.type === 'absence') {
      return {
        userId:         payload.sub,
        email:          payload.email,
        name:           payload.name,
        posteId:        payload.posteId,
        isWorkingToday: false,
        absentToday:    true,
        isReplacing:    false,
      };
    }

    // Jour exceptionnel (remplaçant) → en service sur le poste remplacé
    if (planning?.type === 'exceptional') {
      return {
        userId:         payload.sub,
        email:          payload.email,
        name:           payload.name,
        posteId:        planning.overridePosteId ?? payload.posteId,
        isWorkingToday: true,
        absentToday:    false,
        isReplacing:    !!planning.overridePosteId,
      };
    }

    // Cas normal : calculer isWorkingToday depuis group_schedule_day en temps réel
    let isWorkingToday = false;
    if (commercial?.groupId) {
      const scheduleDay = await this.scheduleDayRepo.findOne({
        where: { groupId: commercial.groupId, date: today, isWorkDay: true },
      });
      isWorkingToday = !!scheduleDay;
    }

    return {
      userId:         payload.sub,
      email:          payload.email,
      name:           payload.name,
      posteId:        payload.posteId,
      isWorkingToday,
      absentToday:    false,
      isReplacing:    false,
    };
  }
}
