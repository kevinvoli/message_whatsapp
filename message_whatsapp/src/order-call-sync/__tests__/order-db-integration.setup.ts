import { DataSource } from 'typeorm';
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import { OrderCallLog } from 'src/order-read/entities/order-call-log.entity';
import { GicopUser } from 'src/order-read/entities/giocop-user.entity';
import { OrderCommandStatus } from 'src/order-read/entities/order-command-status.entity';
import { MessagingClientDossierMirror } from 'src/order-write/entities/messaging-client-dossier-mirror.entity';

export const DB2_INTEGRATION_AVAILABLE = !!process.env['TEST_ORDER_DB_HOST'];

let _ds: DataSource | null = null;

export async function getDb2TestDataSource(): Promise<DataSource> {
  if (_ds && _ds.isInitialized) return _ds;
  _ds = new DataSource({
    type: 'mysql',
    host: process.env['TEST_ORDER_DB_HOST'] ?? 'localhost',
    port: parseInt(process.env['TEST_ORDER_DB_PORT'] ?? '3307', 10),
    username: process.env['TEST_ORDER_DB_USER'] ?? 'test',
    password: process.env['TEST_ORDER_DB_PASSWORD'] ?? 'test',
    database: process.env['TEST_ORDER_DB_NAME'] ?? 'gicop_test',
    entities: [OrderCommand, OrderCallLog, GicopUser, OrderCommandStatus, MessagingClientDossierMirror],
    synchronize: false,
    logging: false,
  });
  await _ds.initialize();
  return _ds;
}

export async function closeDb2TestDataSource(): Promise<void> {
  if (_ds?.isInitialized) await _ds.destroy();
  _ds = null;
}
