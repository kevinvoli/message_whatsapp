# Plan d'implémentation — Provider Instagram Direct Messages
Date : 2026-06-01
Statut : Audit réel effectué — 85–90 % implémenté

---

## 1. État réel après audit du code

| Composant | Fichier | Statut |
|-----------|---------|--------|
| Adapter inbound (normalisation) | `src/webhooks/adapters/instagram.adapter.ts` | ✅ Complet |
| Webhook controller (challenge + POST) | `src/whapi/whapi.controller.ts` lignes 418–506 | ✅ Complet |
| UnifiedIngressService.ingestInstagram() | `src/webhooks/unified-ingress.service.ts` | ✅ Complet |
| Service outbound texte | `src/communication_whapi/communication_instagram.service.ts` | ✅ Complet |
| Service outbound médias | idem | ✅ BUG-1+BUG-2 corrigés |
| Routeur outbound texte | `src/communication_whapi/outbound-router.service.ts` | ✅ Complet |
| Routeur outbound médias | idem | ✅ Case instagram présent |
| Token refresh | `src/channel/meta-token.service.ts` | ✅ Complet |
| Interface TypeScript webhook | `src/whapi/interface/instagram-webhook.interface.ts` | ✅ Complet |
| Registry adapters | `src/webhooks/adapters/provider-adapter.registry.ts` | ✅ Enregistré |
| Schema SQL (provider, external_id, token…) | `whapi_channels` | ✅ Compatible |
| Badge provider frontend | `front/src/components/ui/ProviderBadge.tsx` | ✅ Complet |
| Formulaire admin création canal | `admin/src/app/ui/ChannelsView.tsx` | ✅ Complet |

---

## 2. Bugs confirmés à corriger

### BUG-1 — Caption silencieusement ignorée dans sendMediaMessage() [CRITIQUE]
- **Fichier :** `src/communication_whapi/communication_instagram.service.ts`
- **Symptôme :** Le paramètre `caption?: string` est accepté et transmis jusqu'au service, mais n'est jamais injecté dans le payload envoyé à l'API Meta.
- **Impact :** Toutes les légendes de médias (images, vidéos) envoyées via Instagram sont perdues sans erreur.
- **Fix :**
  ```typescript
  // Dans sendMediaMessage(), step 2 — construction de sendPayload
  // AVANT (ligne ~109–116) :
  const sendPayload = {
    recipient: { id: data.recipientIgsid },
    message: {
      attachment: {
        type: attachmentType,
        payload: { attachment_id: attachmentId },
      },
    },
  };

  // APRÈS :
  const sendPayload: Record<string, unknown> = {
    recipient: { id: data.recipientIgsid },
    message: {
      attachment: {
        type: attachmentType,
        payload: { attachment_id: attachmentId },
      },
      ...(data.caption ? { text: data.caption } : {}),
    },
  };
  ```

### BUG-2 — Type 'document' non géré dans toInstagramAttachmentType() [MOYEN]
- **Fichier :** `src/communication_whapi/communication_instagram.service.ts`
- **Symptôme :** La méthode `sendMediaMessage()` accepte `mediaType: 'document'` dans sa signature mais `toInstagramAttachmentType()` ne mappe pas ce cas → comportement indéfini.
- **Note :** L'UI admin avertit déjà l'utilisateur que les documents ne sont pas supportés côté Instagram.
- **Fix :** Lever une `BadRequestException` explicite pour le type 'document' (cohérent avec le traitement audio déjà en place) :
  ```typescript
  private toInstagramAttachmentType(mediaType: string): string {
    switch (mediaType) {
      case 'image':    return 'image';
      case 'video':    return 'video';
      case 'document': throw new BadRequestException('Instagram DM ne supporte pas l\'envoi de documents');
      default:         return 'file';
    }
  }
  ```

---

## 3. Travail restant — par ordre de priorité

### P0 — Corrections bugs ✅ FAIT

#### Tâche 1 : Fix BUG-1 caption ignorée ✅
- **Fichier :** `message_whatsapp/src/communication_whapi/communication_instagram.service.ts` ligne 116
- **Fix appliqué :** `...(data.caption ? { text: data.caption } : {})` dans le payload step 2

#### Tâche 2 : Fix BUG-2 type document ✅
- **Fichier :** `message_whatsapp/src/communication_whapi/communication_instagram.service.ts` lignes 150–153
- **Fix appliqué :** `case 'document': throw new BadRequestException(...)` dans `toInstagramAttachmentType()`

### P1 — Tests unitaires (partiellement fait)

#### Tâche 3 : Tests adapter inbound ✅ FAIT — 29/29
- **Fichier :** `message_whatsapp/src/webhooks/adapters/__tests__/instagram.adapter.spec.ts`
- **Cas couverts :** texte, image/vidéo/ig_reel/reel/audio/file, story_mention/share/fallback → unknown, is_deleted/is_unsupported/réactions/read receipts filtrés, direction out, reply_to, timestamp ms→s, payload vide/dégradé, multi-messaging

#### Tâche 4 : Tests service outbound ✅ FAIT — 12/12
- **Fichier :** `message_whatsapp/src/communication_whapi/communication_instagram.service.spec.ts`
- **Cas couverts :** caption présente/absente/vide, type document → BadRequestException, type audio → BadRequestException, image/video nominaux

### P2 — Tests intégration ✅ PARTIELLEMENT FAIT

#### Tâche 5 : Tests webhook inbound ✅ FAIT — 16/16
- **Fichier :** `message_whatsapp/src/whapi/whapi.controller.spec.ts`
- **Cas couverts :** challenge valide/invalide/mode invalide, signature absente→401, signature incorrecte→403, signature valide→200, canal introuvable→422, payload invalide (objet/entry absent/entry vide)→400, duplicate→duplicate_ignored, conflict→409, réponse nominale {status:'ok'}, contexte ingestInstagram vérifié

#### Tâche 6 : Test end-to-end avec Meta Sandbox
- Créer un compte test Instagram Business dans Meta Developer Console
- Configurer un canal Instagram dans l'admin (externe_id + token + verify_token + app_secret)
- Envoyer un DM depuis un compte test → vérifier apparition dans l'interface agent
- Répondre en texte depuis l'interface agent → vérifier réception côté Instagram
- Répondre avec image + caption → vérifier caption présente (régression BUG-1)

### P3 — Améliorations optionnelles (backlog)

#### Tâche 7 : File dégradée Instagram (low priority)
- **Contexte :** Messenger et Meta ont une queue dédiée (`enqueueDegradedMessenger`, `enqueueDegradedMeta`). Instagram traite de façon synchrone.
- **Action :** Ajouter `enqueueDegradedInstagram()` dans `whapi.controller.ts` si le volume le justifie.
- **Priorité :** Basse — acceptable en synchrone à faible volume.

#### Tâche 8 : Support réactions Instagram (future)
- **Contexte :** L'adapter filtre actuellement les réactions (pas de type unifié).
- **Action :** Ajouter un type `UnifiedMessageType.reaction` et normaliser les événements de réaction.
- **Priorité :** Backlog — nécessite évolution du modèle unifié.

---

## 4. Contraintes techniques à retenir

| Contrainte | Valeur | Impact |
|-----------|--------|--------|
| Fenêtre messagerie | 7 jours après dernier message client | Les messages hors-fenêtre retournent une erreur 400 de l'API Meta |
| Rate limit | ~100 messages/jour/conversation | À monitorer en production |
| Token durée | 60 jours (long-lived token) | `meta-token.service.ts` gère déjà le refresh |
| Audio | Non supporté par l'API Meta Instagram | Exception levée dans le service |
| Documents | Non supporté | Exception à lever (BUG-2) |
| Groupes | Inexistants | DM uniquement, type = 'private' |
| Read receipts | Watermark (pas par message) | Adapter normalise correctement |

---

## 5. Format des identifiants

| Entité | Format | Exemple |
|--------|--------|---------|
| chat_id | `{IGSID}@instagram` | `17841400000001234@instagram` |
| provider_message_id | `mid.xxx` | `mid.ABGGFlA5FpIABkXxxx` |
| external_id canal | ig_account_id | `17841400000000000` |

---

## 6. Checklist de mise en production

- [x] BUG-1 caption corrigé et testé
- [x] BUG-2 document exception ajoutée
- [x] Tests unitaires adapter (Tâche 3) — 29/29
- [x] Tests service outbound (Tâche 4) — 12/12
- [ ] Canal Instagram créé dans admin (test sandbox)
- [ ] Webhook enregistré dans Meta Developer Console → `/webhooks/instagram`
- [ ] Test inbound message → agent reçoit le DM
- [ ] Test outbound texte → client reçoit la réponse
- [ ] Test outbound image + caption → caption présente
- [ ] Token refresh vérifié (tokenExpiresAt renseigné en BDD)
- [ ] Alerte monitoring configurée si token refresh échoue

---

## 7. Estimation d'effort révisée

| Tâche | Effort estimé |
|-------|--------------|
| BUG-1 fix caption | 15 min |
| BUG-2 fix document | 10 min |
| Tests unitaires adapter + service | 2–3 h |
| Tests intégration webhook | 1–2 h |
| Test E2E Meta Sandbox | 1–2 h |
| **Total** | **4–7 h** |

---

*Plan généré le 2026-06-01 — basé sur audit complet du code existant.*
