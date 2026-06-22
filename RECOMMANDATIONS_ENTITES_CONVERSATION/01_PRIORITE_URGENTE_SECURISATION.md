# Priorite urgente - Securisation du modele conversationnel

## Objectif

Eviter les bugs les plus couteux : doublons de messages, mauvaise conversation rattachee, session active incoherente, compteur non lu faux, rapport bloque ou mauvaise synchronisation avec les entites client.

## 1. Clarifier l'identite des messages

### Probleme

`WhatsappMessage` contient trois identifiants externes proches :

- `message_id`
- `external_id`
- `provider_message_id`

Dans le dump serveur, ces colonnes existent toutes et sont meme en `varchar(512)`. Dans le code, elles sont parfois utilisees comme equivalents. C'est un risque direct pour la deduplication et les mises a jour de statut.

### Recommandation urgente

Definir cette regle :

- `id` : identifiant interne unique.
- `provider_message_id` : identifiant canonique du message chez le provider.
- `provider` : provider source (`whapi`, `meta`, `messenger`, etc.).
- `tenant_id` : proprietaire logique.
- `message_id` : legacy compatible Whapi.
- `external_id` : legacy compatible statuts anciens.

### Action concrete

Toutes les recherches critiques doivent prioriser :

```text
tenant_id + provider + provider_message_id + direction
```

Quand `tenant_id` manque encore, utiliser au minimum :

```text
provider + provider_message_id + direction
```

## 2. Stabiliser la relation `WhatsappChat` / `ChatSession`

### Probleme

`WhatsappChat` contient `active_session_id`, `window_expires_at`, `last_window_reminder_sent_at`. Ces champs sont des caches de `ChatSession`.

Risque :

- une session est ouverte mais `active_session_id` n'est pas a jour ;
- une session est fermee mais le chat pointe encore dessus ;
- `window_expires_at` diverge de `chat_session.auto_close_at`.

### Recommandation urgente

Declarer officiellement :

- `ChatSession` est la source de verite des fenetres.
- `WhatsappChat.active_session_id` et `window_expires_at` sont des caches operationnels.

### Action concrete

Creer un job de reconciliation qui corrige :

- chat avec `active_session_id` vers une session fermee ;
- session active sans `active_session_id` cote chat ;
- `window_expires_at` different de `chat_session.auto_close_at` ;
- chat ferme avec session encore ouverte ;
- session expiree non fermee.

## 3. Securiser `unread_count`

### Probleme

`WhatsappChat.unread_count` est une denormalisation des messages entrants non lus. Elle est utile pour le temps reel, mais elle peut diverger si :

- un webhook status marque un message autrement ;
- une lecture commerciale est partielle ;
- une erreur survient entre persistance message et mise a jour chat.

### Recommandation urgente

Conserver `unread_count` dans `WhatsappChat`, mais le traiter comme un cache.

### Action concrete

Ajouter une reconciliation planifiee :

```sql
SELECT chat_id, COUNT(*)
FROM whatsapp_message
WHERE direction = 'IN'
  AND deletedAt IS NULL
  AND read_by_commercial_id IS NULL
GROUP BY chat_id;
```

Puis comparer avec `whatsapp_chat.unread_count`.

## 4. Verrouiller les transitions de statut conversation

### Probleme

`WhatsappChat.status` peut etre modifie par plusieurs chemins :

- dispatcher ;
- fermeture manuelle ;
- expiration de session ;
- reouverture par message client ;
- validation/report ;
- rotation de fenetre.

### Recommandation urgente

Documenter les transitions autorisees :

- `en attente` -> `actif`
- `actif` -> `ferme`
- `ferme` -> `en attente` ou `actif` si nouveau message client
- `actif` -> `en attente` si agent offline ou redispatch

### Action concrete

Centraliser les transitions dans un service ou helper unique. Chaque changement doit ecrire dans `audit_log` ou une nouvelle table `conversation_status_event`.

## 5. Corriger le risque multi-tenant

### Probleme

Les tables ont souvent `tenant_id`, mais pas toujours :

- `whatsapp_message` : oui.
- `whatsapp_chat` : oui.
- `chat_session` : non.
- `conversation_report` : non.
- `contact` : non dans le dump.

### Recommandation urgente

Ne pas tout migrer brutalement, mais commencer par les requetes critiques :

- message incoming ;
- status update ;
- chat lookup ;
- report lookup ;
- contact findOrCreate.

### Action concrete

Ajouter `tenant_id` progressivement aux tables qui doivent etre isolees :

- priorite 1 : `chat_session`
- priorite 1 : `conversation_report`
- priorite 2 : `contact`
- priorite 2 : `client_dossier`

## 6. Ne pas supprimer de table maintenant

Le dump montre des tables legacy et possiblement redondantes. Aucune suppression directe ne doit etre faite en priorite urgente.

Avant suppression :

- verifier si une entite TypeORM existe ;
- verifier si du code lit/ecrit la table ;
- verifier si un cron ou une integration externe l'utilise ;
- exporter les volumes ;
- renommer en `_legacy_*` si necessaire avant drop definitif.
