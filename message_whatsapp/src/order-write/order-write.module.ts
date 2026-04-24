import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingClientDossierMirror } from './entities/messaging-client-dossier-mirror.entity';
import { OrderDossierMirrorWriteService } from './services/order-dossier-mirror-write.service';
import { IntegrationSyncModule } from 'src/integration-sync/integration-sync.module';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessagingClientDossierMirror,
      CommercialIdentityMapping,
      ClientIdentityMapping,
    ]),
    IntegrationSyncModule,
  ],
  providers: [OrderDossierMirrorWriteService],
  exports:   [OrderDossierMirrorWriteService],
})
export class OrderWriteModule {}
