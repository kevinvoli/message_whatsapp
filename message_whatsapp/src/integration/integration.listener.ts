import { Injectable } from '@nestjs/common';

/**
 * Listener de dispatch ERP — neutralisé.
 * Les dispatches HTTP vers l'ERP ont été remplacés par la lecture directe DB2.
 * Ce fichier est conservé pour éviter les erreurs de module mais ne fait plus rien.
 * À supprimer physiquement dans le prochain lot de nettoyage (Epic L phase D).
 */
@Injectable()
export class IntegrationListener {}
