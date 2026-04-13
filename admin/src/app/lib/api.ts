// admin/src/app/lib/api.ts
// Façade de ré-export — tous les imports existants continuent de fonctionner.
// Pour les nouveaux usages, importer directement depuis le fichier de domaine :
//   import { getChats } from '@/app/lib/api/conversations.api'

export * from './api/auth.api';
export * from './api/channels.api';
export * from './api/conversations.api';
export * from './api/dispatch.api';
export * from './api/metrics.api';
export * from './api/notifications.api';
export * from './api/system-config.api';
export * from './api/automations.api';
export * from './api/postes.api';
export * from './api/commerciaux.api';
export * from './api/clients.api';
export * from './api/crons.api';
