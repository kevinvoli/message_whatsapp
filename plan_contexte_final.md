
# PLAN COMPLET — ARCHITECTURE MULTI-CONTEXTE (VERSION FINALE)

Date: 2026-04-15

---

# 1. OBJECTIF

- 1 client = 1 seule conversation (WhatsappChat)
- Ajouter une couche de contexte indépendante
- Permettre :
  - multi-postes
  - multi-providers
  - multi-canaux
  - bots avancés
  - auto-messages isolés

---

# 2. ARCHITECTURE GLOBALE

WhatsappChat (unique)
    |
    |---- ChatContext (N)
            |
            |---- Context (définition métier)
            |---- Poste
            |---- Provider
            |---- Channel
            |---- Bot / Auto-message

---

# 3. ENTITÉS

## 3.1 Context

- id
- code (support, recrutement, vip)
- label
- is_active
- config (json)

---

## 3.2 ContextBinding

Permet de lier un contexte à n'importe quelle entité

- id
- context_id
- entity_type (channel | poste | provider)
- entity_id
- is_active

---

## 3.3 ChatContext

Etat d’un contexte pour un chat donné

- id
- chat_id
- chat_uuid
- context_id
- poste_id

### Etat auto-message

- auto_message_step
- waiting_client_reply
- last_auto_message_sent_at

### Triggers

- no_response_auto_step
- queue_wait_auto_step
- inactivity_auto_step

---

## 3.4 WhatsappMessage (modification)

Ajouter:

- context_id

---

## 3.5 WhapiChannel (modification optionnelle)

Ajouter:

- context_id (fallback possible)

---

# 4. RÉSOLUTION DU CONTEXTE

Ordre de priorité:

1. channel
2. poste
3. provider
4. default (pool)

---

# 5. DISPATCHER

Flow:

1. recevoir message
2. identifier channel
3. resolve context via ContextBinding
4. récupérer chat
5. récupérer ou créer ChatContext
6. assigner poste si nécessaire

---

# 6. AUTO-MESSAGE

Avant:
chat.auto_message_step

Maintenant:
chatContext.auto_message_step

Isolation complète par contexte

---

# 7. ORCHESTRATOR

Lock basé sur:

chatContext.id

Permet exécution parallèle sans conflit

---

# 8. FRONTEND

1 chat unique

mais affichage:

- Chat (support)
- Chat (recrutement)

Filtrage:

WHERE context_id = X

---

# 9. MIGRATION (SANS PERTE)

1. Créer tables:
   - contexts
   - context_bindings
   - chat_contexts

2. Créer contexte par défaut:
   - pool

3. Migrer chats:

INSERT INTO chat_contexts (chat_id, chat_uuid, context_id)
SELECT chat_id, id, 'pool'
FROM whatsapp_chats;

4. Migrer messages:

UPDATE whatsapp_messages
SET context_id = 'pool'
WHERE context_id IS NULL;

---

# 10. AVANTAGES

- aucune perte de données
- extensible
- découplé
- scalable
- prêt pour IA / bots

---

# 11. CAS FUTURS POSSIBLES

- bot RH dédié
- priorisation VIP
- segmentation marketing
- multi-tenant avancé

---

# 12. CONCLUSION

Architecture:

- robuste
- modulaire
- évolutive

Permet de transformer le système en plateforme conversationnelle avancée.
