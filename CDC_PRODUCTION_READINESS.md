# Cahier des Charges — Passage en Production
> Référence : `PLAN_PRODUCTION_READINESS.md` (2026-03-25)
> Généré le : 2026-03-26
> Branche cible : `production-readiness` (à créer depuis `master`)

---

## État initial constaté (audit du code)

| # | Item | État réel observé |
|---|------|-------------------|
| 1 | HMAC Whapi | Ligne 58 `whapi.controller.ts` : appel commenté. `WebhookCryptoService.assertWhapiSecret()` existe déjà. |
| 2 | WebSocket résilience | `SocketProvider.tsx` : aucune option de reconnexion (`reconnectionAttempts`, `reconnectionDelay`). Pas d'`ErrorBoundary`. |
| 3 | Dispatch automatique | Mutex sans timeout. `first_response_deadline_at` calculé mais jamais surveillé. |
| 4 | MessageAuto | Pas de vérification statut template avant envoi. Pas de Dead Letter Queue. |
| 5 | Métriques Math.random() | `OverviewView.tsx` ligne 76 : `Math.floor(Math.random() * 30) - 10`. Confirmé. |
| 6 | Enregistrement vocal | Pas de `MAX_DURATION`. Pas de `beforeunload`. Pas de preview avant envoi. |
| 7 | Reply — affichage historique | `quotedMessage` non rendu dans `ChatMessage.tsx` (voir `feature-reply-message.md`). |
| 8 | Multi-providers erreurs | Telegram et Messenger n'ont pas le pattern `kind: permanent/transient`. |
| 9 | CORS sécurité | `CORS_ORIGINS` optionnel même en production (Joi). `*` possible. |
| 10 | Feature Flags | Lus via `ConfigService` (déjà amélioré), pas de vue admin, pas de doc. |
| 11 | Metadata SEO | `front/src/app/layout.tsx` : titre "Create Next App". |
| 12 | Contacts déduplication | Aucune normalisation E.164. Pas de contrainte unique sur le numéro normalisé. |
| 13 | Typing cleanup | Pas de `beforeunload`. Pas de TTL serveur. |
| 14 | TypeORM synchronize | ✅ **Déjà protégé** : `database.module.ts` ligne 24 : `synchronize: isDev && forceSync`. Non bloquant. |
| 15 | Tests | Couverture partielle — plusieurs chemins critiques non couverts. |

---

## Priorisation

| Priorité | Items | Raison |
|----------|-------|--------|
| 🔴 **P0 — Bloquant avant prod** | #1, #5, #9 | Faille sécurité active / donnée mensongère / CORS wildcard possible |
| 🟠 **P1 — Semaine 1** | #2, #3, #8, #13 | Résilience, data loss silencieux, UX dégradée |
| 🟡 **P2 — Semaine 2** | #4, #6, #7, #12, #15 | Fonctionnel mais incomplet |
| 🟢 **P3 — Backlog** | #10, #11 | Confort / polish |

---

## P0 — Bloquants (à livrer avant toute mise en production)

---

### Tâche P0-1 : Réactiver la validation HMAC Whapi

**Fichier** : `message_whatsapp/src/whapi/whapi.controller.ts`

**Problème** : La ligne 58 est commentée depuis le dev. Toute URL webhook connue peut recevoir des faux événements.

**Ce qui existe déjà** : `WebhookCryptoService.assertWhapiSecret()` est implémenté et testé. Le secret de rotation (`WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS`) est déjà prévu dans le schéma Joi.

**Implémentation** :

1. Décommenter la ligne 58 dans `whapi.controller.ts` :
   ```typescript
   // AVANT
   // this.cryptoService.assertWhapiSecret(headers, request.rawBody, payload);

   // APRÈS
   this.cryptoService.assertWhapiSecret(headers, request.rawBody, payload);
   ```

2. Ajouter dans `WHAPI_WEBHOOK_SECRET_HEADER` et `WHAPI_WEBHOOK_SECRET_VALUE` le statut `required()` conditionnel en production dans le schéma Joi de `app.module.ts` :
   ```typescript
   // Remplacer le .and() existant par une validation conditionnelle
   WHAPI_WEBHOOK_SECRET_HEADER: Joi.when('NODE_ENV', {
     is: 'production',
     then: Joi.string().required(),
     otherwise: Joi.string().allow('').optional(),
   }),
   WHAPI_WEBHOOK_SECRET_VALUE: Joi.when('NODE_ENV', {
     is: 'production',
     then: Joi.string().required(),
     otherwise: Joi.string().allow('').optional(),
   }),
   ```

3. Ajouter un test dans `whapi.controller.spec.ts` (ou nouveau fichier `whapi-hmac.spec.ts`) :
   ```typescript
   it('retourne 403 si la signature HMAC est invalide', async () => {
     // POST /webhooks/whapi avec header X-Hub-Signature-256 incorrect
     // Attendre HttpStatus.FORBIDDEN
   });
   it('accepte la requête avec la signature valide', async () => { ... });
   it('accepte la requête avec le secret de rotation (PREVIOUS)', async () => { ... });
   ```

**Critères d'acceptation** :
- [ ] Requête sans header de signature → `403 Forbidden`
- [ ] Requête avec signature incorrecte → `403 Forbidden`
- [ ] Requête avec `WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS` (rotation) → `200 OK`
- [ ] Démarrage avec `NODE_ENV=production` sans les variables → erreur Joi au boot

---

### Tâche P0-2 : Supprimer Math.random() dans les métriques admin

**Fichier** : `admin/src/app/ui/OverviewView.tsx`

**Problème** : La fonction `getVariation()` retourne une valeur aléatoire affichée comme une vraie variation de KPI.

**Implémentation** :

1. Côté backend — modifier `MetriquesService.getOverviewMetriques()` pour retourner les données comparatives :
   - Fichier : `message_whatsapp/src/metriques/metriques.service.ts`
   - Ajouter un paramètre `period: 'day' | 'week' | 'month'` à la méthode
   - Calculer les mêmes métriques sur la période précédente équivalente (ex: semaine N vs N-1)
   - Retourner `{ current: number; previous: number; variation: number }` pour chaque KPI

2. Modifier le DTO de réponse :
   - Fichier : `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
   - Ajouter `variation?: number` (null si données insuffisantes)

3. Côté admin — modifier `OverviewView.tsx` :
   ```typescript
   // SUPPRIMER complètement :
   const getVariation = (valeur: number) => {
     return Math.floor(Math.random() * 30) - 10;
   };

   // REMPLACER par :
   const getVariation = (current: number, previous: number | null): number | null => {
     if (previous == null || previous === 0) return null;
     return Math.round(((current - previous) / previous) * 100);
   };
   ```

4. Dans le rendu, afficher `"—"` si la variation est `null` (données comparatives absentes).

**Critères d'acceptation** :
- [ ] Aucun appel à `Math.random()` dans tout le frontend
- [ ] Les variations affichées correspondent aux vraies données comparatives
- [ ] Si données insuffisantes, affiche `"—"` (pas de valeur fictive)
- [ ] Test unitaire sur `getOverviewMetriques()` qui vérifie les calculs de variation

---

### Tâche P0-3 : CORS strict en production

**Fichier** : `message_whatsapp/src/app.module.ts`

**Problème** : `CORS_ORIGINS` est `optional()` même en production, ce qui permet un wildcard `*` accidentel.

**Implémentation** :

1. Modifier le schéma Joi pour rendre `CORS_ORIGINS` obligatoire en production et interdire `*` :
   ```typescript
   CORS_ORIGINS: Joi.when('NODE_ENV', {
     is: 'production',
     then: Joi.string()
       .required()
       .custom((value, helpers) => {
         if (value === '*' || value.includes('*')) {
           return helpers.error('any.invalid');
         }
         return value;
       })
       .messages({ 'any.invalid': 'CORS_ORIGINS ne peut pas contenir de wildcard (*) en production' }),
     otherwise: Joi.string().allow('').optional(),
   }),
   ```

2. Ajouter dans `.env.example` (si le fichier existe) :
   ```
   # Production : liste d'origines séparées par des virgules — AUCUN wildcard autorisé
   CORS_ORIGINS=https://app.mondomaine.com,https://admin.mondomaine.com
   ```

3. Ajouter un test de démarrage (guard au boot) dans `main.ts` :
   ```typescript
   const nodeEnv = configService.get<string>('NODE_ENV');
   const origins = configService.get<string>('CORS_ORIGINS') ?? '';
   if (nodeEnv === 'production' && (!origins || origins.includes('*'))) {
     throw new Error('CORS_ORIGINS doit être défini et sans wildcard en production');
   }
   ```

**Critères d'acceptation** :
- [ ] `NODE_ENV=production` sans `CORS_ORIGINS` → erreur au démarrage
- [ ] `NODE_ENV=production` avec `CORS_ORIGINS=*` → erreur au démarrage
- [ ] `NODE_ENV=development` sans `CORS_ORIGINS` → démarrage normal

---

## P1 — Résilience (Semaine 1)

---

### Tâche P1-1 : WebSocket — Reconnexion exponentielle + ErrorBoundary

**Fichiers** :
- `front/src/contexts/SocketProvider.tsx`
- `front/src/components/WebSocketEvents.tsx` (nouveau : `WebSocketErrorBoundary.tsx`)

**Implémentation** :

1. Configurer les options de reconnexion dans `SocketProvider.tsx` :
   ```typescript
   const newSocket = io(socketUrl, {
     transports: ['websocket'],
     withCredentials: true,
     ...(token ? { auth: { token } } : {}),
     reconnection: true,
     reconnectionAttempts: 10,
     reconnectionDelay: 1000,       // 1s initial
     reconnectionDelayMax: 30000,   // max 30s
     randomizationFactor: 0.5,
     timeout: 20000,
   });
   ```

2. Exposer `reconnecting: boolean` dans le contexte socket :
   ```typescript
   interface SocketContextType {
     socket: Socket | null;
     isConnected: boolean;
     isReconnecting: boolean;
   }
   ```
   - `newSocket.on('reconnecting', () => setIsReconnecting(true))`
   - `newSocket.on('reconnect', () => setIsReconnecting(false))`
   - `newSocket.on('reconnect_failed', () => setIsReconnecting(false))`

3. Créer `front/src/components/WebSocketErrorBoundary.tsx` :
   ```typescript
   class WebSocketErrorBoundary extends React.Component<...> {
     state = { hasError: false };
     static getDerivedStateFromError() { return { hasError: true }; }
     render() {
       if (this.state.hasError) return <div>Connexion perdue. Rechargez la page.</div>;
       return this.props.children;
     }
   }
   ```

4. Dans `front/src/app/layout.tsx`, entourer `<WebSocketEvents />` avec le boundary :
   ```tsx
   <WebSocketErrorBoundary>
     <WebSocketEvents />
   </WebSocketErrorBoundary>
   ```

5. Afficher un banner "Reconnexion en cours..." si `isReconnecting === true` dans le layout principal.

**Critères d'acceptation** :
- [ ] Coupure réseau simulée → reconnexion automatique visible dans les logs (10 tentatives max)
- [ ] Délai exponentiel entre tentatives (1s, 2s, 4s... max 30s)
- [ ] Erreur JS dans `WebSocketEvents` → boundary s'affiche, l'app ne plante pas
- [ ] Banner "Reconnexion..." visible pendant la phase de reconnexion

---

### Tâche P1-2 : Dispatch — Timeout mutex + monitoring SLA

**Fichiers** :
- `message_whatsapp/src/dispatcher/dispatcher.service.ts`
- `message_whatsapp/src/dispatcher/services/queue.service.ts`
- `message_whatsapp/src/jorbs/tasks.service.ts`

**Implémentation** :

1. Ajouter un timeout sur `dispatchLock.runExclusive()` dans `dispatcher.service.ts` :
   ```typescript
   import { withTimeout, E_TIMEOUT } from 'async-mutex';

   private readonly dispatchLockWithTimeout = withTimeout(this.dispatchLock, 5000);

   // Dans assignConversation() :
   try {
     return await this.dispatchLockWithTimeout.runExclusive(async () => {
       return await this.assignConversationInternal(chatId, fromName, traceId, tenantId);
     });
   } catch (e) {
     if (e === E_TIMEOUT) {
       this.logger.error(`DISPATCH_LOCK_TIMEOUT chatId=${chatId} traceId=${traceId}`);
       return null; // Fallback : la conversation reste en attente
     }
     throw e;
   }
   ```

2. Créer un `CronJob` dans `tasks.service.ts` pour surveiller les SLA dépassés (toutes les 5 minutes) :
   ```typescript
   @Cron('*/5 * * * *')
   async checkSlaBreaches(): Promise<void> {
     const now = new Date();
     const breached = await this.chatRepository.find({
       where: {
         status: WhatsappChatStatus.EN_ATTENTE,
         first_response_deadline_at: LessThan(now),
       },
     });
     if (breached.length > 0) {
       this.logger.warn(`SLA_BREACH count=${breached.length} chatIds=${breached.map(c => c.chat_id).join(',')}`);
       // Émettre un événement pour notifier l'admin via WebSocket si connecté
       this.eventEmitter.emit(EVENTS.SLA_BREACH_DETECTED, { conversations: breached });
     }
   }
   ```

3. Ajouter le log structuré pour les conversations en attente sans agent (> 10 min) :
   ```typescript
   @Cron('*/10 * * * *')
   async checkStuckConversations(): Promise<void> {
     const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
     const stuck = await this.chatRepository.count({
       where: {
         status: WhatsappChatStatus.EN_ATTENTE,
         poste_id: IsNull(),
         last_activity_at: LessThan(tenMinutesAgo),
       },
     });
     if (stuck > 0) {
       this.logger.warn(`CONVERSATIONS_STUCK_WITHOUT_AGENT count=${stuck}`);
     }
   }
   ```

**Critères d'acceptation** :
- [ ] Si `assignConversationInternal` prend > 5s → log `DISPATCH_LOCK_TIMEOUT` + return null (pas de blocage)
- [ ] Toutes les 5 min, les conversations SLA dépassées apparaissent dans les logs
- [ ] Toutes les 10 min, le count des conversations sans agent > 10min apparaît dans les logs

---

### Tâche P1-3 : Multi-providers — Uniformiser les erreurs (Telegram + Messenger)

**Fichiers** :
- `message_whatsapp/src/communication_whapi/communication_telegram.service.ts`
- `message_whatsapp/src/communication_whapi/communication_messenger.service.ts`
- `message_whatsapp/src/communication_whapi/communication_instagram.service.ts`

**Implémentation** :

1. Appliquer le pattern `kind: 'permanent' | 'transient'` (déjà utilisé dans Meta) à Telegram :
   ```typescript
   // communication_telegram.service.ts
   private classifyError(statusCode: number): 'permanent' | 'transient' {
     if (statusCode === 429) return 'transient';   // rate limit → retry
     if (statusCode === 503) return 'transient';   // serveur indisponible → retry
     if (statusCode >= 400 && statusCode < 500) return 'permanent'; // 400, 401, 403 → pas de retry
     return 'transient'; // 5xx → retry
   }
   ```

2. Créer une classe commune `ProviderOutboundError` dans `src/common/errors/provider-outbound.error.ts` :
   ```typescript
   export class ProviderOutboundError extends Error {
     constructor(
       public readonly provider: string,
       public readonly statusCode: number,
       public readonly kind: 'permanent' | 'transient',
       message: string,
     ) {
       super(message);
       this.name = 'ProviderOutboundError';
     }
   }
   ```

3. Utiliser cette classe dans les 4 services de communication (Whapi, Meta, Telegram, Messenger).

4. Log structuré uniforme dans tous les providers :
   ```typescript
   this.logger.error(
     `OUTBOUND_ERROR provider=${provider} status=${statusCode} kind=${kind} chatId=${chatId}`
   );
   ```

**Critères d'acceptation** :
- [ ] `ProviderOutboundError` levée par Telegram, Messenger, Instagram, Meta, Whapi
- [ ] Telegram 429 → `kind: 'transient'`
- [ ] Telegram 400 → `kind: 'permanent'`
- [ ] Test par provider : comportement sur erreur réseau timeout
- [ ] Log `OUTBOUND_ERROR` présent dans tous les providers

---

### Tâche P1-4 : Typing indicator — Cleanup sur fermeture/navigation

**Fichiers** :
- `front/src/components/chat/ChatInput.tsx`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**Implémentation** :

1. Dans `ChatInput.tsx`, envoyer `typing_stop` sur `beforeunload` et changement de conversation :
   ```typescript
   // Cleanup sur fermeture de page
   useEffect(() => {
     const handleUnload = () => {
       if (chat_id) onTypingStop(chat_id);
     };
     window.addEventListener('beforeunload', handleUnload);
     return () => window.removeEventListener('beforeunload', handleUnload);
   }, [chat_id, onTypingStop]);

   // Cleanup sur changement de conversation
   useEffect(() => {
     return () => {
       if (chat_id) onTypingStop(chat_id);
     };
   }, [chat_id]);
   ```

2. Côté backend, ajouter un TTL sur les statuts de frappe dans le gateway :
   ```typescript
   // Map<chatId, { commercialId, expiresAt }>
   private readonly typingState = new Map<string, { commercialId: string; timer: NodeJS.Timeout }>();

   setTyping(chatId: string, commercialId: string): void {
     // Annuler le timer précédent si existant
     const existing = this.typingState.get(chatId);
     if (existing) clearTimeout(existing.timer);

     const timer = setTimeout(() => {
       this.typingState.delete(chatId);
       this.emitTypingStop(chatId, commercialId);
     }, 5000); // Auto-stop après 5s sans mise à jour

     this.typingState.set(chatId, { commercialId, timer });
   }
   ```

**Critères d'acceptation** :
- [ ] Fermeture d'onglet → `typing_stop` émis (vérifié avec devtools Network)
- [ ] Changement de conversation → `typing_stop` sur l'ancienne conversation
- [ ] Backend : si pas de `typing_update` pendant 5s → auto-stop émis aux autres clients
- [ ] Aucun indicateur de frappe ne persiste indéfiniment côté client

---

## P2 — Fonctionnel incomplet (Semaine 2)

---

### Tâche P2-1 : Messages automatiques — Guard template + Dead Letter

**Fichiers** :
- `message_whatsapp/src/message-auto/message-auto.service.ts`
- `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts`
- Nouveau : `message_whatsapp/src/message-auto/entities/message-template-status.entity.ts`

**Implémentation** :

1. Créer l'entité `MessageTemplateStatus` (nouvelle table) :
   ```typescript
   @Entity('message_template_status')
   export class MessageTemplateStatus {
     @PrimaryGeneratedColumn('uuid') id: string;
     @Column() templateName: string;
     @Column() language: string;
     @Column({ default: 'APPROVED' }) status: string; // APPROVED | PAUSED | REJECTED
     @Column({ nullable: true }) qualityScore: string;
     @Column({ type: 'timestamp', nullable: true }) lastCheckedAt: Date;
     @CreateDateColumn() createdAt: Date;
     @UpdateDateColumn() updatedAt: Date;
   }
   ```

2. Avant chaque envoi de template HSM dans `message-auto.service.ts` :
   ```typescript
   const templateStatus = await this.templateStatusRepo.findOne({
     where: { templateName: template.name, language: template.language }
   });
   if (templateStatus && templateStatus.status !== 'APPROVED') {
     this.logger.warn(`TEMPLATE_SKIPPED template=${template.name} status=${templateStatus.status}`);
     return null; // Skip silencieusement
   }
   ```

3. Dead Letter Queue — après N échecs consécutifs (N=3 configurable) :
   ```typescript
   // Stocker le compteur d'échecs dans WhatsappChat.auto_message_status
   // Si auto_message_status = 'failed:3', stopper la séquence et notifier admin
   if (failCount >= MAX_RETRIES) {
     chat.auto_message_status = 'failed';
     await this.chatRepository.save(chat);
     this.logger.error(`AUTO_MSG_DLQ chatId=${chat.chat_id} failCount=${failCount}`);
     this.eventEmitter.emit(EVENTS.AUTO_MESSAGE_FAILED, { chat });
   }
   ```

**Migration BDD requise** :
- Créer la table `message_template_status` via une migration TypeORM

**Critères d'acceptation** :
- [ ] Template avec `status = 'PAUSED'` → envoi skipé, log `TEMPLATE_SKIPPED`
- [ ] 3 échecs consécutifs → séquence marquée `failed`, log `AUTO_MSG_DLQ`
- [ ] Migration appliquée sans erreur sur un schéma existant
- [ ] Test : comportement si template absent de la table (défaut = APPROVED)

---

### Tâche P2-2 : Enregistrement vocal — Limite durée + preview

**Fichier** : `front/src/components/chat/ChatInput.tsx`

**Implémentation** :

1. Ajouter une constante `MAX_RECORDING_SECONDS = 300` (5 minutes).

2. Dans le `setInterval` d'incrément de durée :
   ```typescript
   recordingIntervalRef.current = setInterval(() => {
     setRecordingDuration(prev => {
       if (prev + 1 >= MAX_RECORDING_SECONDS) {
         stopRecording(); // Arrêt automatique
       }
       return prev + 1;
     });
   }, 1000);
   ```

3. Afficher un avertissement à 30s de la fin :
   ```tsx
   {isRecording && recordingDuration >= MAX_RECORDING_SECONDS - 30 && (
     <span className="text-red-500 text-xs">
       Arrêt automatique dans {MAX_RECORDING_SECONDS - recordingDuration}s
     </span>
   )}
   ```

4. Libérer les tracks microphone sur fermeture de page :
   ```typescript
   useEffect(() => {
     const handleUnload = () => {
       mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
     };
     window.addEventListener('beforeunload', handleUnload);
     return () => window.removeEventListener('beforeunload', handleUnload);
   }, []);
   ```

5. Ajouter un bouton "Écouter" avant envoi :
   - Après `mediaRecorder.onstop`, stocker le blob dans un state `previewBlob`
   - Afficher `<audio controls src={URL.createObjectURL(previewBlob)} />` + boutons "Envoyer" / "Annuler"
   - Révoquer l'URL avec `URL.revokeObjectURL()` après envoi ou annulation

**Critères d'acceptation** :
- [ ] Enregistrement > 5 minutes → arrêt automatique
- [ ] Avertissement visible à 4m30s
- [ ] Fermeture d'onglet pendant enregistrement → micro libéré (vérifié dans les permissions navigateur)
- [ ] Bouton "Écouter" disponible avant envoi

---

### Tâche P2-3 : Reply — Affichage du message cité dans l'historique

**Fichier** : `front/src/components/chat/ChatMessage.tsx`

**Référence** : `memory/feature-reply-message.md`

**Implémentation** :

1. Afficher le bloc citation si `message.quotedMessage` est présent :
   ```tsx
   {message.quotedMessage && (
     <div
       className="border-l-4 border-green-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 mb-1 rounded text-sm cursor-pointer"
       onClick={() => scrollToMessage(message.quotedMessageId)}
     >
       <p className="font-medium text-green-600 text-xs">
         {message.quotedMessage.fromName ?? message.quotedMessage.from}
       </p>
       <p className="text-gray-600 dark:text-gray-300 line-clamp-2">
         {message.quotedMessage.text ?? `[${message.quotedMessage.type}]`}
       </p>
     </div>
   )}
   ```

2. Implémenter `scrollToMessage(id)` : trouver l'élément DOM par `data-message-id={id}` et appeler `.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

3. Gérer le message cité supprimé :
   ```tsx
   {message.quotedMessageId && !message.quotedMessage && (
     <div className="border-l-4 border-gray-400 bg-gray-100 px-2 py-1 mb-1 rounded text-sm text-gray-400 italic">
       Message supprimé
     </div>
   )}
   ```

**Critères d'acceptation** :
- [ ] Message avec `quotedMessage` non null → bloc citation visible au-dessus du texte
- [ ] Clic sur le bloc → scroll vers le message original
- [ ] Message original supprimé → affiche "Message supprimé" (pas de crash)

---

### Tâche P2-4 : Contacts — Normalisation E.164

**Fichier** : `message_whatsapp/src/contact/contact.service.ts`

**Implémentation** :

1. Créer un helper `normalizePhone(raw: string): string` dans `src/common/utils/phone.utils.ts` :
   ```typescript
   export function normalizePhone(raw: string): string {
     // Retire tout sauf chiffres et +
     const digits = raw.replace(/[^\d+]/g, '');
     // Normalise le préfixe algérien 0X → +213X
     if (digits.startsWith('0') && digits.length === 10) {
       return '+213' + digits.slice(1);
     }
     // Ajoute + si manquant
     if (!digits.startsWith('+')) return '+' + digits;
     return digits;
   }
   ```

2. Appliquer `normalizePhone()` dans `upsertContact()` avant toute persistance.

3. Ajouter une contrainte unique `@Unique(['phoneNormalized'])` sur l'entité `Contact`.

4. **Migration BDD requise** :
   - Ajouter colonne `phone_normalized VARCHAR(20)`
   - Backfill depuis `phone` existant
   - Ajouter index unique sur `phone_normalized`

**Critères d'acceptation** :
- [ ] `+213612345678`, `0612345678`, `213612345678` → même valeur normalisée
- [ ] Double insertion avec numéros équivalents → upsert (pas de doublon)
- [ ] Test unitaire sur `normalizePhone()`

---

### Tâche P2-5 : Tests — Couverture critique minimale

**Fichiers** : nouveaux fichiers `*.spec.ts` dans les modules concernés

**Tests à écrire** (7 suites) :

| Suite | Fichier cible | Cas à couvrir |
|-------|--------------|---------------|
| MetaAdapter | `meta-adapter.spec.ts` | `referral`, `reaction`, `system` message types |
| OutboundRouterService | `outbound-router.spec.ts` | Channel sans `external_id` → erreur propre |
| CommunicationMetaService | `communication-meta.spec.ts` | 429 → retry, 400 → pas de retry |
| DispatcherService | `dispatcher.spec.ts` | 0 agent disponible → conversation reste en queue |
| InboundMessageService | `inbound-message.spec.ts` | 2 messages simultanés même chat → idempotence |
| WhapiController (HMAC) | `whapi-hmac.spec.ts` | Signature invalide → 403, valide → 200 |
| MessageAutoOrchestrator | `auto-message-orchestrator.spec.ts` | Template PAUSED → skip, 3 échecs → DLQ |

**Critères d'acceptation** :
- [ ] 7 nouvelles suites créées et passantes
- [ ] `npx jest --no-coverage` → 0 échec

---

## P3 — Backlog (polish)

---

### Tâche P3-1 : Feature Flags — Service centralisé + vue admin

**Implémentation** :

1. Créer `message_whatsapp/src/feature-flags/feature-flag.service.ts` :
   ```typescript
   @Injectable()
   export class FeatureFlagService {
     private readonly flags = {
       FF_UNIFIED_WEBHOOK_ROUTER: { description: 'Routeur webhook unifié', default: false },
       FF_SHADOW_UNIFIED: { description: 'Mode shadow pour test routeur', default: false },
     } as const;

     constructor(private readonly configService: ConfigService) {}

     isEnabled(flag: keyof typeof this.flags): boolean {
       const raw = this.configService.get<string>(flag);
       return raw ? ['1','true','yes','on'].includes(raw.toLowerCase()) : this.flags[flag].default;
     }

     getAllFlags(): Record<string, { enabled: boolean; description: string }> {
       return Object.fromEntries(
         Object.entries(this.flags).map(([key, meta]) => [
           key,
           { enabled: this.isEnabled(key as any), description: meta.description }
         ])
       );
     }
   }
   ```

2. Remplacer les appels `configService.get()` dans `WhapiService.readFlag()` par `featureFlagService.isEnabled()`.

3. Ajouter un endpoint admin `GET /admin/feature-flags` qui retourne `getAllFlags()`.

4. Ajouter une page "Feature Flags" dans le panel admin.

**Critères d'acceptation** :
- [ ] `FeatureFlagService` unique point de lecture des flags
- [ ] Endpoint admin retourne la liste des flags avec leur état
- [ ] Page admin visible avec le statut de chaque flag

---

### Tâche P3-2 : Metadata SEO

**Fichiers** :
- `front/src/app/layout.tsx`
- `admin/src/app/layout.tsx`

**Implémentation** :

```typescript
// front/src/app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: 'Espace Commercial — WhatsApp CCaaS',
    template: '%s — WhatsApp CCaaS',
  },
  description: 'Interface de gestion des conversations WhatsApp pour agents commerciaux',
};

// admin/src/app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: 'Administration — WhatsApp CCaaS',
    template: '%s — Admin',
  },
  description: 'Panel d\'administration WhatsApp CCaaS',
};
```

Ajouter des titres par route (ex: `front/src/app/chat/page.tsx` → `export const metadata = { title: 'Conversations' }`).

**Critères d'acceptation** :
- [ ] Onglet navigateur affiche le bon titre sur chaque page
- [ ] Aucune occurrence de "Create Next App" dans le code

---

## Récapitulatif des fichiers à modifier

### Backend (`message_whatsapp/src/`)
| Fichier | Tâche | Type |
|---------|-------|------|
| `whapi/whapi.controller.ts` | P0-1 | Décommenter 1 ligne |
| `app.module.ts` | P0-1, P0-3 | Joi schema |
| `main.ts` | P0-3 | Guard CORS prod |
| `metriques/metriques.service.ts` | P0-2 | Nouvelles méthodes comparatives |
| `metriques/dto/create-metrique.dto.ts` | P0-2 | Champ `variation` |
| `dispatcher/dispatcher.service.ts` | P1-2 | Timeout mutex |
| `jorbs/tasks.service.ts` | P1-2 | 2 CronJobs SLA |
| `communication_whapi/communication_telegram.service.ts` | P1-3 | ProviderOutboundError |
| `communication_whapi/communication_messenger.service.ts` | P1-3 | ProviderOutboundError |
| `message-auto/message-auto.service.ts` | P2-1 | Guard template |
| `message-auto/auto-message-orchestrator.service.ts` | P2-1 | Dead Letter Queue |
| `contact/contact.service.ts` | P2-4 | Normalisation E.164 |
| `common/utils/phone.utils.ts` | P2-4 | Nouveau fichier |
| `common/errors/provider-outbound.error.ts` | P1-3 | Nouveau fichier |
| `feature-flags/feature-flag.service.ts` | P3-1 | Nouveau fichier |

### Frontend (`front/src/`)
| Fichier | Tâche | Type |
|---------|-------|------|
| `contexts/SocketProvider.tsx` | P1-1 | Options reconnexion |
| `components/WebSocketErrorBoundary.tsx` | P1-1 | Nouveau fichier |
| `app/layout.tsx` | P1-1, P3-2 | ErrorBoundary + metadata |
| `components/chat/ChatInput.tsx` | P1-4, P2-2 | Typing stop + enregistrement |
| `components/chat/ChatMessage.tsx` | P2-3 | Bloc citation |

### Admin (`admin/src/`)
| Fichier | Tâche | Type |
|---------|-------|------|
| `app/ui/OverviewView.tsx` | P0-2 | Supprimer Math.random() |
| `app/layout.tsx` | P3-2 | Metadata |
| `app/feature-flags/page.tsx` | P3-1 | Nouveau fichier |

---

## Migrations de base de données requises

| Migration | Table | Opération |
|-----------|-------|-----------|
| `AddMessageTemplateStatus` | `message_template_status` | CREATE TABLE |
| `AddPhoneNormalized` | `contact` | ADD COLUMN `phone_normalized` + INDEX UNIQUE |

> ⚠️ Les deux migrations sont **non destructives** (ADD COLUMN, CREATE TABLE). Aucune colonne existante modifiée.

---

## Ordre d'implémentation recommandé

```
1. P0-1 (HMAC)        — 30 min  — décommenter + test
2. P0-2 (Math.random) — 2h      — backend variation + frontend
3. P0-3 (CORS strict) — 30 min  — Joi + guard main.ts
4. P1-1 (WebSocket)   — 2h      — SocketProvider + ErrorBoundary
5. P1-3 (Erreurs)     — 3h      — ProviderOutboundError partout
6. P1-4 (Typing)      — 1h      — beforeunload + TTL backend
7. P1-2 (Dispatch)    — 3h      — timeout mutex + CronJobs
8. P2-3 (Reply UI)    — 2h      — bloc citation + scroll
9. P2-2 (Vocal)       — 2h      — limite + preview + beforeunload
10. P2-1 (MessageAuto) — 4h     — guard + DLQ + migration
11. P2-4 (Contacts)   — 3h      — E.164 + migration
12. P2-5 (Tests)      — 1 jour  — 7 suites
13. P3-1 (Flags)      — 3h      — service + endpoint + page
14. P3-2 (Metadata)   — 30 min  — layout titles
```

**Total estimé** : ~4 jours de développement backend/frontend.
