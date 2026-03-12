# Plan : Actualisation automatique du token longue durée Meta (60 jours)

## Contexte et état actuel

### Ce qui existe
- `WhapiChannel.token` (TEXT) stocke l'access_token Meta statiquement
- Aucune logique de refresh, aucune date d'expiration trackée
- `WHATSAPP_APP_SECRET` en variable d'env (niveau application)
- Admin panel → `ChannelsView.tsx` → `PATCH /channel/:id` pour mettre le token à la main
- `CommunicationMetaService` utilise `channel.token` comme Bearer token

### Problème
Les tokens Meta générés manuellement expirent après ~60 jours (5 184 000 secondes).
Sans refresh automatique, les envois de messages échouent silencieusement après expiration.

### API Meta utilisée pour le refresh
```
GET https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=APP_ID
  &client_secret=APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN

→ { "access_token": "EAAJ...", "token_type": "bearer", "expires_in": 5184000 }
```

---

## Architecture de la solution

### Choix des credentials (APP_ID / APP_SECRET)
- Utiliser des **variables d'env globales** (`META_APP_ID`, `META_APP_SECRET`)
  → Simple, fonctionne si tous les canaux Meta partagent la même app Meta
- Alternative per-channel : stocker `meta_app_id` dans `WhapiChannel`
  → Plus flexible si plusieurs apps Meta coexistent (complexité accrue)

**Recommandation : variables d'env globales dans un premier temps.**

### Approche retenue
1. Ajouter `tokenExpiresAt` (datetime nullable) dans `WhapiChannel`
2. Créer `MetaTokenService` : logique d'échange et de refresh
3. Endpoint admin `POST /channel/:id/refresh-token` : refresh manuel
4. Cron job quotidien : refresh automatique des tokens qui expirent dans < 7 jours
5. Admin UI : afficher date d'expiration + bouton refresh

---

## Phases d'implémentation

---

### Phase 1 — Base de données : ajouter `tokenExpiresAt`

#### 1.1 Entité `WhapiChannel`
**Fichier** : `message_whatsapp/src/channel/entities/channel.entity.ts`

Ajouter après le champ `token` (ligne ~41) :
```typescript
@Column({ type: 'datetime', nullable: true, name: 'token_expires_at' })
tokenExpiresAt: Date | null;
```

#### 1.2 Migration TypeORM
**Nouveau fichier** : `message_whatsapp/src/database/migrations/20260312_add_token_expires_at_channel.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTokenExpiresAtChannel20260312 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'token_expires_at',
        type: 'datetime',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whapi_channels', 'token_expires_at');
  }
}
```

---

### Phase 2 — Backend : `MetaTokenService`

**Nouveau fichier** : `message_whatsapp/src/channel/meta-token.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WhapiChannel } from './entities/channel.entity';

@Injectable()
export class MetaTokenService {
  private readonly logger = new Logger(MetaTokenService.name);
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v22.0';

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Échange un token court (ou long) contre un nouveau token long (60 jours).
   * Retourne { accessToken, expiresAt }.
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        'META_APP_ID et META_APP_SECRET doivent être définis dans les variables d\'environnement',
      );
    }

    const url = `https://graph.facebook.com/${this.META_API_VERSION}/oauth/access_token`;
    const params = {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    };

    const response = await firstValueFrom(
      this.httpService.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>(url, { params }),
    );

    const { access_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    return { accessToken: access_token, expiresAt };
  }

  /**
   * Refresh le token d'un canal spécifique et met à jour la BDD.
   */
  async refreshChannelToken(channelId: string): Promise<WhapiChannel> {
    const channel = await this.channelRepo.findOneOrFail({
      where: { id: channelId },
    });

    if (channel.provider !== 'meta') {
      throw new Error(`Le canal ${channelId} n'est pas un canal Meta`);
    }

    const { accessToken, expiresAt } = await this.exchangeForLongLivedToken(
      channel.token,
    );

    channel.token = accessToken;
    channel.tokenExpiresAt = expiresAt;

    await this.channelRepo.save(channel);
    this.logger.log(
      `Token refreshé pour canal ${channelId}, expire le ${expiresAt.toISOString()}`,
    );
    return channel;
  }

  /**
   * Cron : refresh automatique des canaux Meta dont le token expire dans < 7 jours.
   * Appelé par le scheduler quotidien.
   */
  async refreshExpiringTokens(): Promise<void> {
    const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // J+7

    const channels = await this.channelRepo.find({
      where: {
        provider: 'meta',
        tokenExpiresAt: LessThan(threshold),
      },
    });

    if (channels.length === 0) {
      this.logger.log('Aucun token Meta à renouveler');
      return;
    }

    this.logger.log(
      `${channels.length} token(s) Meta à renouveler (expiration < 7 jours)`,
    );

    for (const channel of channels) {
      try {
        await this.refreshChannelToken(channel.id);
      } catch (err) {
        this.logger.error(
          `Échec refresh token canal ${channel.id}: ${err.message}`,
        );
        // Continue avec les autres canaux — ne pas bloquer le batch
      }
    }
  }
}
```

---

### Phase 3 — Backend : Endpoint `POST /channel/:id/refresh-token`

**Fichier** : `message_whatsapp/src/channel/channel.controller.ts`

Ajouter après les routes existantes :
```typescript
@Post(':id/refresh-token')
@UseGuards(AdminGuard)
async refreshToken(@Param('id') id: string) {
  return this.metaTokenService.refreshChannelToken(id);
}
```

**Fichier** : `message_whatsapp/src/channel/channel.service.ts`

Lors de la création d'un canal Meta avec `POST /channel`, si le token est fourni,
appeler `MetaTokenService.exchangeForLongLivedToken()` automatiquement et sauvegarder
le token long + `tokenExpiresAt`.

```typescript
// Dans createMetaChannel() après création de l'objet
if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
  try {
    const { accessToken, expiresAt } =
      await this.metaTokenService.exchangeForLongLivedToken(dto.token);
    metaChannel.token = accessToken;
    metaChannel.tokenExpiresAt = expiresAt;
  } catch (err) {
    this.logger.warn(
      `Impossible d'échanger le token Meta (token court gardé): ${err.message}`,
    );
  }
}
```

---

### Phase 4 — Backend : Cron job (scheduler NestJS)

**Fichier** : `message_whatsapp/src/channel/channel.module.ts`

Ajouter `@nestjs/schedule` si pas déjà présent, et un `ScheduleModule.forRoot()` dans `AppModule`.

**Nouveau fichier** : `message_whatsapp/src/channel/meta-token-scheduler.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetaTokenService } from './meta-token.service';

@Injectable()
export class MetaTokenSchedulerService {
  constructor(private readonly metaTokenService: MetaTokenService) {}

  // Tous les jours à 3h00 UTC
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyTokenRefresh(): Promise<void> {
    await this.metaTokenService.refreshExpiringTokens();
  }
}
```

**Installation package** (si absent) :
```bash
npm install @nestjs/schedule
```

---

### Phase 5 — Variables d'environnement

**Fichier** : `message_whatsapp/.env` (et `.env.example`)

Ajouter :
```bash
# Meta App credentials (pour token refresh long-lived)
META_APP_ID=123456789012345
META_APP_SECRET=your_meta_app_secret_here
```

> ⚠️ `META_APP_SECRET` est différent de `WHATSAPP_APP_SECRET` :
> - `META_APP_SECRET` = secret de l'app Meta (pour OAuth token exchange)
> - `WHATSAPP_APP_SECRET` = secret pour vérifier la signature HMAC des webhooks

---

### Phase 6 — Admin Panel : UI

#### 6.1 Type Channel
**Fichier** : `admin/src/app/lib/definitions.ts`

Ajouter dans le type `Channel` :
```typescript
tokenExpiresAt?: string | null;  // ISO date string
```

#### 6.2 API call
**Fichier** : `admin/src/app/lib/api.ts`

Ajouter :
```typescript
export async function refreshChannelToken(id: string): Promise<Channel> {
  return apiFetch<Channel>(`/channel/${id}/refresh-token`, {
    method: 'POST',
  });
}
```

#### 6.3 ChannelsView : afficher expiration + bouton refresh
**Fichier** : `admin/src/app/ui/ChannelsView.tsx`

Dans le tableau/liste des canaux, pour chaque canal Meta :
- Afficher la date d'expiration du token (formatée via `dateUtils.formatDate`)
- Badge coloré :
  - 🟢 Vert : expire dans > 14 jours
  - 🟡 Orange : expire dans 7–14 jours
  - 🔴 Rouge : expire dans < 7 jours ou expiré
- Bouton "Renouveler token" → appelle `refreshChannelToken(id)` → recharge la liste

Exemple d'indicateur :
```tsx
{channel.provider === 'meta' && (
  <div className="token-expiry">
    <span className={getExpiryClass(channel.tokenExpiresAt)}>
      Expire : {formatTokenExpiry(channel.tokenExpiresAt)}
    </span>
    <button onClick={() => handleRefreshToken(channel.id)}>
      Renouveler token
    </button>
  </div>
)}
```

Fonction helper :
```typescript
function formatTokenExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Inconnue';
  const date = new Date(expiresAt);
  const daysLeft = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return `Expiré depuis ${Math.abs(daysLeft)} jours`;
  return `dans ${daysLeft} jours (${formatDateShort(expiresAt)})`;
}

function getExpiryClass(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'text-gray-400';
  const daysLeft = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 7) return 'text-red-600 font-bold';
  if (daysLeft < 14) return 'text-orange-500';
  return 'text-green-600';
}
```

---

## Module NestJS — Mise à jour `ChannelModule`

**Fichier** : `message_whatsapp/src/channel/channel.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([WhapiChannel, ProviderChannel]),
    HttpModule,
  ],
  controllers: [ChannelController],
  providers: [
    ChannelService,
    MetaTokenService,
    MetaTokenSchedulerService,
  ],
  exports: [ChannelService, MetaTokenService],
})
export class ChannelModule {}
```

---

## Récapitulatif des fichiers à créer/modifier

### Nouveaux fichiers
| Fichier | Description |
|---------|-------------|
| `message_whatsapp/src/channel/meta-token.service.ts` | Logique d'échange token Meta |
| `message_whatsapp/src/channel/meta-token-scheduler.service.ts` | Cron quotidien |
| `message_whatsapp/src/database/migrations/20260312_add_token_expires_at_channel.ts` | Migration BDD |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `message_whatsapp/src/channel/entities/channel.entity.ts` | Ajouter `tokenExpiresAt` |
| `message_whatsapp/src/channel/channel.controller.ts` | Ajouter `POST /:id/refresh-token` |
| `message_whatsapp/src/channel/channel.service.ts` | Auto-exchange à la création |
| `message_whatsapp/src/channel/channel.module.ts` | Enregistrer nouveaux services |
| `message_whatsapp/src/app.module.ts` | `ScheduleModule.forRoot()` |
| `message_whatsapp/.env` + `.env.example` | `META_APP_ID`, `META_APP_SECRET` |
| `admin/src/app/lib/definitions.ts` | Ajouter `tokenExpiresAt` au type Channel |
| `admin/src/app/lib/api.ts` | Ajouter `refreshChannelToken()` |
| `admin/src/app/ui/ChannelsView.tsx` | Affichage expiration + bouton refresh |

---

## Ordre d'exécution recommandé

1. **Phase 1** — Migration BDD (fondation)
2. **Phase 2** — `MetaTokenService` (logique core)
3. **Phase 3** — Endpoint backend + auto-exchange à la création
4. **Phase 4** — Cron job
5. **Phase 5** — Variables d'env
6. **Phase 6** — Admin UI

---

## Points d'attention

### Sécurité
- `META_APP_SECRET` ne doit jamais être exposé côté frontend
- Le token refreshé doit remplacer l'ancien en BDD atomiquement (pas de fenêtre sans token valide)
- Logger les refreshs mais **jamais** le token lui-même dans les logs

### Gestion des erreurs
- Si le refresh échoue (réseau, secret invalide, token révoqué) : logger l'erreur, garder l'ancien token, envoyer une alerte (log ERROR niveau)
- Ne pas bloquer le cron si un canal échoue — continuer avec les autres

### Migration des canaux existants
- Les canaux Meta existants auront `tokenExpiresAt = NULL`
- L'admin devra cliquer "Renouveler token" manuellement pour initialiser `tokenExpiresAt`
- Ou : script de migration one-shot pour appeler l'exchange sur tous les canaux Meta existants

### Compatibilité
- Si `META_APP_ID` / `META_APP_SECRET` non définis → le refresh échoue gracieusement (warning)
  Le canal continue à fonctionner avec le token existant
- Le cron ne tourne que si les variables sont configurées

---

## Test manuel (via curl)

Une fois le backend déployé :
```bash
# Refresh manuel d'un canal
curl -X POST https://your-api/channel/CHANNEL_UUID/refresh-token \
  -H "Cookie: admin-session=..."

# Vérifier le résultat
curl https://your-api/channel/CHANNEL_UUID \
  -H "Cookie: admin-session=..." | jq '.tokenExpiresAt'
```
