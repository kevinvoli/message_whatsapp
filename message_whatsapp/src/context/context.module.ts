import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Context } from './entities/context.entity';
import { ContextBinding } from './entities/context-binding.entity';
import { ChatContext } from './entities/chat-context.entity';

import { ContextResolverService } from './services/context-resolver.service';
import { ContextService } from './services/context.service';

import { ContextController } from './context.controller';

/**
 * CTX-A4 — ContextModule
 *
 * Exporte ContextResolverService et ContextService pour les modules
 * qui ont besoin de résoudre / manipuler les contextes :
 *   - DispatcherModule (CTX-C1)
 *   - IngressModule / InboundMessageService (CTX-C2)
 *   - FlowBotModule (CTX-D1)
 */
@Module({
  imports: [TypeOrmModule.forFeature([Context, ContextBinding, ChatContext])],
  providers: [ContextResolverService, ContextService],
  controllers: [ContextController],
  exports: [ContextResolverService, ContextService],
})
export class ContextModule {}
