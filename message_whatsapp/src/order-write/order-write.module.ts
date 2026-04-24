import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDossierMirrorWriteService } from './services/order-dossier-mirror-write.service';
import { IntegrationSyncModule } from 'src/integration-sync/integration-sync.module';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';

/**
 * NB : MessagingClientDossierMirror n'est PAS dans TypeOrmModule.forFeature
 * car c'est une entité DB2. Elle est accédée uniquement via
 * `DataSource.getRepository(MessagingClientDossierMirror)` sur la connexion ORDER_DB_DATA_SOURCE.
 * La table doit être pré-créée par l'équipe DB2 — aucune migration de notre côté.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialIdentityMapping, ClientIdentityMapping]),
    IntegrationSyncModule,
  ],
  providers: [OrderDossierMirrorWriteService],
  exports:   [OrderDossierMirrorWriteService],
})
export class OrderWriteModule {}
