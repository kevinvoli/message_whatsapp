
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret',
    });
  }

  async validate(payload: any) {
    console.log("les information contenue dans le token", payload);
    
    // Ce qui est retourné sera injecté dans request.user
    return {
      uid: payload.uid,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };
  }
}
