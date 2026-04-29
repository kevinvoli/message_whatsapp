import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from './order-db.constants';
import { OrderDbRepository } from './order-db.repository';
// Entités DB2 — déclarées explicitement pour que getRepository() fonctionne
// sans ambiguïté. synchronize: false → aucune migration générée.
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import { OrderCallLog } from 'src/order-read/entities/order-call-log.entity';
import { GicopUser } from 'src/order-read/entities/giocop-user.entity';
import { MessagingClientDossierMirror } from 'src/order-write/entities/messaging-client-dossier-mirror.entity';

const logger = new Logger('OrderDbModule');

/**
 * Fournit une connexion read-only vers la base de données de la plateforme commandes (DB2).
 *
 * Règles d'usage :
 * - Lecture UNIQUEMENT sur les tables natives DB2 (commandes, statuts_commandes, call_logs…).
 * - Écriture UNIQUEMENT dans les tables miroir dédiées (messaging_*).
 * - Si ORDER_DB_HOST n'est pas configuré, le DataSource est null et les fonctionnalités
 *   DB2 sont silencieusement désactivées — l'application démarre quand même.
 */
const orderDbProvider: Provider = {
  provide: ORDER_DB_DATA_SOURCE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<DataSource | null> => {
    const host = config.get<string>('ORDER_DB_HOST');
    if (!host) {
      logger.warn('ORDER_DB_HOST non configuré — connexion DB2 désactivée');
      return null;
    }

    const dataSource = new DataSource({
      type: 'mysql',
      host:config.get<string>('ORDER_DB_HOST'),
      port:     config.get<number>('ORDER_DB_PORT'),
      username: config.get<string>('ORDER_DB_USER') ,
      password: config.get<string>('ORDER_DB_PASSWORD') ,
      database: config.get<string>('ORDER_DB_NAME') ,
      // Entités DB2 connues — synchronize: false garantit aucune DDL
      entities:          [OrderCommand, OrderCallLog, GicopUser, MessagingClientDossierMirror],
      synchronize:       false,   // JAMAIS de migration sur DB2
      migrationsRun:     false,   // JAMAIS de migration sur DB2
      logging:           false,
      connectTimeout:    10_000,
      extra: {
        connectionLimit:    5,
        waitForConnections: true,
        queueLimit:         50,
        enableKeepAlive:    true,
        keepAliveInitialDelay: 30_000,
      },
    });

    try {
      await dataSource.initialize();
      logger.log(`Connexion DB2 établie → ${host}/${config.get('ORDER_DB_NAME')}`);
      return dataSource;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Connexion DB2 échouée: ${message} — fonctionnalités DB2 désactivées`);
      return null;
    }
  },
};

const availableProvider: Provider = {
  provide:    ORDER_DB_AVAILABLE,
  inject:     [ORDER_DB_DATA_SOURCE],
  useFactory: (ds: DataSource | null) => ds !== null,
};

@Global()
@Module({
  imports:   [ConfigModule],
  providers: [orderDbProvider, availableProvider, OrderDbRepository],
  exports:   [ORDER_DB_DATA_SOURCE, ORDER_DB_AVAILABLE, OrderDbRepository],
})
export class OrderDbModule {}
