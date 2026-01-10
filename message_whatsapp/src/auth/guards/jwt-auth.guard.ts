/* eslint-disable prettier/prettier */
import { ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

import { TokenService } from '../jwt.service';
 
import { InjectRepository } from '@nestjs/typeorm';
 
import { Repository } from 'typeorm';
import { RolePermissions } from '../../role-permissions/entities/role-permission.entity';
import { permission } from 'process';




@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector, 
    private jwtService: TokenService,
    @InjectRepository(RolePermissions)
    private readonly rolePermissionRepository: Repository<RolePermissions>,

  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {

    try {
      const isPublic = this.reflector.getAllAndOverride('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) return true;
      const data = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(data);
      if (!token) {
        throw new NotFoundException({ status: 401, message: 'Token manquant' });
      }
      try {

        
        // const decoded = await this.jwtService.verifyToken(token);
          const decoded = await this.verifyAndDecodeToken(token);
        // console.log("mon role ",decoded);

        const permissionss = await this.getUserPermissions(decoded.roleId)

       data.user= {
          ...decoded,
          permission: permissionss
        }

        
        return true;
      } catch (error) {
        this.handleTokenError(error);
      }
      ;
    } catch (error) {
      throw new NotFoundException({ status: 500, message: 'Erreur serveur' });
    }


  }

  private extractTokenFromHeader(request: any): string | undefined {
     const authHeader = request.headers.authorization || request.headers.Authorization;
    if (!authHeader) return undefined;
    
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async verifyAndDecodeToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyToken(token);
    } catch (error) {
      this.handleTokenError(error);
    }
  }

 private async getUserPermissions(roleId: number): Promise<string[]> {
  if (!roleId) return [];

  const rolePermissions = await this.rolePermissionRepository.find({
    where: { roles: { id: roleId } },
    relations: ['permission'],
  });

  const permissions = rolePermissions
    .filter(rp => rp.permission?.name)
    .map(rp => {
      return rp.permission.name;
    });

  return permissions;
}
  private handleTokenError(error: any): never {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedException('Token expiré');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedException('Token invalide');
    }
    throw new UnauthorizedException('Erreur d\'authentification');
  }

}
