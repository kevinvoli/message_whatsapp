# Plan — Restriction de contenu des messages commerciaux

## Contexte

Les messages envoyés par les **commerciaux** vers les clients doivent être soumis à des restrictions configurables par l'admin :

1. **Longueur de mot** : Un mot ne peut pas contenir plus de N caractères (défaut : 26)
2. **Répétition de lettre** : Une lettre ne peut pas être répétée plus de N fois de façon successive (défaut : 3) — ex: `aaaa` interdit si N=3
3. **Durée audio** : Les messages vocaux/audio ne doivent pas avoir une durée inférieure à N secondes (défaut : 10s)

Ces restrictions s'appliquent **uniquement** aux messages commerciaux (pas aux messages admin).

---

## Découverte clé : aucune migration SQL nécessaire

Le projet possède déjà une table `system_configs` avec un `SystemConfigService` (pattern `get/set/setBulk`). Les 3 nouveaux paramètres seront de simples nouvelles clés dans cette table, insérées au démarrage via le `CONFIG_CATALOGUE`.

---

## Nouvelles clés de configuration

| Clé | Défaut | Signification |
|---|---|---|
| `MSG_RESTRICTION_MAX_WORD_LENGTH` | `"26"` | Nb max de caractères par mot |
| `MSG_RESTRICTION_MAX_REPEATED_CHARS` | `"3"` | Nb max de répétitions successives d'une lettre |
| `MSG_RESTRICTION_MIN_AUDIO_DURATION_SECONDS` | `"10"` | Durée minimale d'un message audio (secondes) |

---

## Endpoints

```
GET  /admin/message-restrictions   [AdminGuard]         → lecture config
PUT  /admin/message-restrictions   [AdminGuard]         → mise à jour config
GET  /message-restrictions/config  [AuthGuard jwt]      → lecture config (frontend commercial)
```

---

## Réponse HTTP 422 — violation

```json
{
  "statusCode": 422,
  "error": "MESSAGE_RESTRICTION_VIOLATED",
  "violations": [
    { "rule": "MAX_WORD_LENGTH",    "detail": "Le mot \"testtttttt\" dépasse 26 caractères" },
    { "rule": "MAX_REPEATED_CHARS", "detail": "Répétition excessive détectée : \"aaaa\"" }
  ]
}
```

---

## US-1 — Configuration backend

**Fichiers à créer :**
- `message_whatsapp/src/message-restriction/dto/message-restriction-config.dto.ts`
- `message_whatsapp/src/message-restriction/message-restriction.service.ts`
- `message_whatsapp/src/message-restriction/message-restriction.controller.ts`
- `message_whatsapp/src/message-restriction/message-restriction.module.ts`

**Fichiers à modifier :**
- `message_whatsapp/src/system-config/system-config.service.ts` — ajouter 3 entrées dans `CONFIG_CATALOGUE` (catégorie `msg_restriction`)
- `message_whatsapp/src/app.module.ts` — importer `MessageRestrictionModule`

**DTO partagé :**

```typescript
export class MessageRestrictionConfigDto {
  @IsInt() @Min(1) @Max(500)
  maxWordLength: number;         // défaut 26

  @IsInt() @Min(1) @Max(100)
  maxRepeatedChars: number;      // défaut 3

  @IsInt() @Min(1) @Max(300)
  minAudioDurationSeconds: number; // défaut 10
}
```

**Service :**
- `getConfig(): Promise<MessageRestrictionConfigDto>` — lit les 3 clés avec fallback sur les défauts
- `updateConfig(dto): Promise<MessageRestrictionConfigDto>` — appelle `systemConfigService.setBulk()`

---

## US-2 — Validation backend

**Dépendance :** US-1 terminée

**Fichiers à modifier :**
- `message_whatsapp/src/message-restriction/message-restriction.service.ts` — méthodes de validation
- `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` — injection + appels validate avant envoi
- `message_whatsapp/src/whatsapp_message/whatsapp_message.module.ts` — import `MessageRestrictionModule`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts` — extraction `duration_seconds` depuis form-data audio

**Méthodes de validation à ajouter dans `MessageRestrictionService` :**

```typescript
validateTextContent(text: string, config: MessageRestrictionConfigDto): ValidationViolation[]
validateAudioDuration(durationSeconds: number | null | undefined, config: MessageRestrictionConfigDto): ValidationViolation | null
```

**Logique règle 1 — longueur de mot :**
- Tokeniser par espace (`text.split(/\s+/)`)
- Utiliser `[...word].length` (pas `.length`) pour compter les caractères Unicode correctement (emojis, caractères multi-octets)
- Ignorer la ponctuation de fin

**Logique règle 2 — répétition de lettre :**
- Regex : `/(.)\1{N,}/` où N = `maxRepeatedChars`
- Si `max=3` → regex `/(.)\1{3,}/` → bloque à partir de 4 occurrences ("aaaa" bloqué, "aaa" autorisé)
- Collecter tous les matches pour le détail de l'erreur

**Logique règle 3 — durée audio :**
- Champ optionnel `duration_seconds: number` dans le `multipart/form-data` de `POST /messages/media`
- Le frontend envoie la durée réelle (le timer `recordingDuration` existe déjà dans `ChatInput.tsx`)
- Si le champ est absent → pas de blocage (best effort)

**Scope de la validation :**
- La validation est placée dans le **contrôleur**, uniquement sur les routes `AuthGuard('jwt')` (commerciaux)
- Les routes `AdminGuard` ne passent pas par cette validation

**Ordre d'exécution :**
- Valider **avant** l'appel à `OutboundRouterService` pour ne pas consommer de quota provider sur un message invalide

---

## US-3 — Interface admin

**Dépendance :** US-1 terminée

**Fichiers à modifier :**
- `admin/src/app/lib/definitions.ts` — ajouter type `MessageRestrictionConfig`
- `admin/src/app/lib/api.ts` — ajouter `getMessageRestrictionConfig()` + `updateMessageRestrictionConfig()`
- `admin/src/app/ui/LectureSeuleView.tsx` — ajouter une nouvelle section avec 3 champs numériques (réutiliser le composant `SectionCard` existant)

**Type à ajouter :**

```typescript
export interface MessageRestrictionConfig {
  maxWordLength: number;
  maxRepeatedChars: number;
  minAudioDurationSeconds: number;
}
```

---

## US-4 — Validation frontend commercial

**Dépendance :** US-1 terminée

**Fichiers à modifier :**
- `front/src/lib/api.ts` — ajouter type `MessageRestrictionConfig` + `getMessageRestrictionConfig()`
- `front/src/store/chatStore.ts` — ajouter `messageRestrictionConfig: MessageRestrictionConfig | null`, chargé au boot
- `front/src/components/chat/ChatInput.tsx` :
  - Validation texte en temps réel via `useMemo` sur `message` (erreur inline sous le textarea, bouton d'envoi bloqué si violation)
  - Vérification durée audio dans `stopRecording()` avant `uploadMedia()` — utiliser `recordingDuration` existant
  - Passer `duration_seconds: recordingDuration` dans le `FormData` de l'upload audio

**Comportement UX :**
- Les erreurs de validation texte apparaissent en temps réel sous la zone de saisie
- Ne pas bloquer la saisie, bloquer uniquement le bouton d'envoi
- L'erreur disparaît dès que l'utilisateur corrige la saisie

---

## Récapitulatif des fichiers

### Créer
| Fichier | US |
|---|---|
| `message_whatsapp/src/message-restriction/dto/message-restriction-config.dto.ts` | US-1 |
| `message_whatsapp/src/message-restriction/message-restriction.service.ts` | US-1 + US-2 |
| `message_whatsapp/src/message-restriction/message-restriction.controller.ts` | US-1 |
| `message_whatsapp/src/message-restriction/message-restriction.module.ts` | US-1 |

### Modifier
| Fichier | US | Nature de la modification |
|---|---|---|
| `message_whatsapp/src/system-config/system-config.service.ts` | US-1 | +3 entrées `CONFIG_CATALOGUE` |
| `message_whatsapp/src/app.module.ts` | US-1 | Import `MessageRestrictionModule` |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` | US-2 | Injection + appels validate |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.module.ts` | US-2 | Import `MessageRestrictionModule` |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts` | US-2 | Extraction `duration_seconds` |
| `admin/src/app/lib/definitions.ts` | US-3 | Type `MessageRestrictionConfig` |
| `admin/src/app/lib/api.ts` | US-3 | 2 fonctions CRUD |
| `admin/src/app/ui/LectureSeuleView.tsx` | US-3 | Nouvelle section formulaire |
| `front/src/lib/api.ts` | US-4 | Type + fonction |
| `front/src/store/chatStore.ts` | US-4 | État + chargement au boot |
| `front/src/components/chat/ChatInput.tsx` | US-4 | Validation texte + audio |

---

## Points d'attention

1. **Sémantique "répété plus de N fois"** : si `max=3`, la regex `/(.)\1{3,}/` bloque à partir de 4 occurrences consécutives ("aaaa" bloqué, "aaa" autorisé). À confirmer avec le product owner.
2. **Unicode** : utiliser `[...word].length` (spread d'itérateur), jamais `.length` pour les longueurs de mot.
3. **Durée audio best effort** : si le navigateur ne fournit pas `duration_seconds` dans le FormData, le backend ne bloque pas. Comportement documenté et accepté.
4. **Scope commercial uniquement** : la validation est placée dans le contrôleur sur les routes `AuthGuard('jwt')`, pas dans le service, pour ne pas affecter les messages admin.
5. **Pas de quota gaspillé** : la validation se fait avant l'appel à `OutboundRouterService`.
