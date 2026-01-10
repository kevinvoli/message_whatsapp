import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PolicyHandler } from '../interface/policies.interface';
import { CHECK_POLICIES_KEY } from '../decorators/policies.decorator';
import { CaslAbilityFactory } from '../casl-ability.factory';



@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) || [];
      // console.log("les handje", handlers);
    
    const request = context.switchToRpc().getData();
    // console.log("les user", request.user);
    const {permission,user} = request.user
      console.log("les permision",  context.switchToRpc().getData());
     
      

    if (!permission) {
      throw new ForbiddenException("L'utilisateur n'est pas authentifié");
    }
    
    const ability = await this.caslAbilityFactory.createForUser(permission);
    handlers.forEach((handler, index) => {
      const result = handler(ability);
      console.log("result:",result);
      
    });
  
    context.getArgs()[0] =typeof request.data=== "object"? {...request.data }: request.data
   
    
    // Vérifier les permissions en utilisant les handlers
    return handlers.every((handler) => handler(ability));
  }
}
