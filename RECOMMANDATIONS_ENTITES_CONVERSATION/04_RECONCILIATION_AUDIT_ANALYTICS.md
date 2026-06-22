# Reconciliation, audit et analytics

## Objectif

Accepter les denormalisations necessaires au temps reel, mais garantir qu'elles peuvent etre controlees, reconstruites et auditees.

## 1. Reconciliation des conversations

### Job recommande : `conversation_state_reconciliation`

Frequence suggeree :

- toutes les 5 a 15 minutes pour les champs critiques ;
- une fois par jour pour les controles lourds.

### Verifications

- `WhatsappChat.unread_count` vs messages IN non lus.
- `WhatsappChat.last_activity_at` vs dernier `WhatsappMessage`.
- `WhatsappChat.last_client_message_at` vs dernier message IN.
- `WhatsappChat.last_poste_message_at` vs dernier message OUT.
- `WhatsappChat.active_session_id` vs session active reelle.
- `WhatsappChat.window_expires_at` vs `ChatSession.auto_close_at`.
- chat `ferme` avec session encore ouverte.
- session expiree non fermee.

## 2. Audit des transitions

### Probleme

Aujourd'hui, les transitions sont dispersees :

- assignation ;
- fermeture ;
- reouverture ;
- read-only ;
- validation ;
- resultat de conversation ;
- expiration de fenetre.

### Recommandation

Utiliser `audit_log` pour commencer, puis creer une table dediee si le volume augmente.

Table optionnelle :

```text
conversation_status_event
- id
- tenant_id
- whatsapp_chat_id
- chat_id
- old_status
- new_status
- old_poste_id
- new_poste_id
- reason
- actor_id
- actor_type
- metadata
- created_at
```

## 3. Audit des messages provider

### Probleme

`WhatsappMessage.status` ne garde que le dernier etat.

### Recommandation

Creer a moyen terme :

```text
message_delivery_event
- id
- tenant_id
- message_id
- provider
- provider_message_id
- status
- error_code
- error_title
- raw_event_hash
- received_at
```

### Entite existante reutilisable

`webhook_event_log` existe deja et peut continuer a servir pour la deduplication generale des webhooks.

Mais `message_delivery_event` serait plus metier : il historise la vie d'un message.

## 4. Analytics

### Entites existantes a reutiliser

- `analytics_snapshot`
- `commercial_daily_performance`
- `flow_analytics`
- `flow_node_analytics`
- `commercial_target`
- `sla_rule`

### Recommandation

Ne pas faire tous les dashboards directement sur `whatsapp_message` et `whatsapp_chat`.

Approche :

1. `WhatsappMessage`, `WhatsappChat`, `ChatSession`, `ConversationReport` restent les sources brutes.
2. Des jobs produisent des snapshots.
3. Les dashboards lisent en priorite les snapshots.

### Snapshots utiles

- volume messages par jour/canal/poste ;
- temps de premiere reponse ;
- sessions ouvertes/fermees/expirees ;
- rapports soumis ;
- conversations fermees par resultat ;
- follow-ups crees/effectues ;
- performance commerciale quotidienne.

## 5. IA et analyse conversationnelle

### Entites existantes a reutiliser

- `ai_execution_log`
- `ai_module_config`
- `ai_provider`

### Entite a creer si besoin

```text
conversation_analysis
- id
- tenant_id
- whatsapp_chat_id
- chat_session_id
- analysis_type
- label
- score
- summary
- payload_json
- model
- created_at
```

Et pour les messages :

```text
message_analysis
- id
- tenant_id
- message_id
- analysis_type
- label
- score
- payload_json
- model
- created_at
```

## 6. Priorite

### Urgent

- Reconciliation `unread_count`, `active_session_id`, `window_expires_at`.
- Audit minimal des transitions de statut.

### Important

- `message_delivery_event`.
- Snapshots analytiques.
- Historique des resultats de conversation.

### Reportable

- Analyse IA detaillee.
- Refonte complete des dashboards vers snapshots.
