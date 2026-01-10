
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    
    if (!requiredPermissions) {
      return true; // Aucune permission spécifique requise
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    // console.log(user);
    
    
    if (!user || !user.permission) {
      throw new ForbiddenException('Permissions insuffisantes');
    }

    const hasPermission = requiredPermissions.every((permission) => {
      
    return  user.permission.includes(permission)

    }
    );

    if (!hasPermission) {
      throw new ForbiddenException('Permissions insuffisantes');
    }

    return true;
  }
}
