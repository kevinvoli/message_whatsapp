import { Module } from '@nestjs/common';

import { CaslAbilityFactory } from './casl-ability.factory';
import { EntityLoader } from './entity-loader.service';



@Module({

   controllers: [
     
    ],
    providers: [
      CaslAbilityFactory,
      EntityLoader,
    ],
})
export class CaslModule {}