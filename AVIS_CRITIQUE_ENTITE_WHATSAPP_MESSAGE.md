# Avis critique complet sur `WhatsappMessage`, `WhatsappChat` et `ChatSession`

Date de lecture : 2026-06-22

## Entites analysees

Ce rapport couvre trois entites centrales du backend WhatsApp :

- `WhatsappMessage` : `message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity.ts`
- `WhatsappChat` : `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`
- `ChatSession` : `message_whatsapp/src/chat-session/entities/chat-session.entity.ts`

Ces trois entites forment le coeur du systeme conversationnel. Mon avis general est qu'elles representent trois niveaux differents du meme domaine :

- `WhatsappMessage` = le fait unitaire : chaque message recu, envoye, lu, echoue ou enrichi.
- `WhatsappChat` = l'etat courant : la conversation visible par les agents, son poste, son statut, son unread count, sa priorite, sa fenetre active.
- `ChatSession` = le cycle temporel : une periode de traitement ouverte/fermee, avec fenetre 24h, fenetre CTWA, auto-fermeture et rappel.

Le modele est globalement pertinent. La faiblesse principale vient du fait que les frontieres entre ces responsabilites ne sont pas encore totalement stabilisees : certaines donnees de session sont denormalisees dans `WhatsappChat`, certaines donnees de conversation sont recalculees depuis `WhatsappMessage`, et certains champs historiques cohabitent avec les nouveaux concepts multi-provider/multi-tenant.

## Lecture globale du modele

Le projet a une architecture conversationnelle assez riche :

1. Un message entrant arrive par webhook.
2. Il est normalise puis persiste comme `WhatsappMessage`.
3. La conversation `WhatsappChat` est mise a jour : dernier canal, compteur non lu, activite, statut, assignation.
4. Une `ChatSession` est ouverte ou prolongee pour gerer la fenetre de reponse.
5. Le gateway socket diffuse le message et la conversation mise a jour.
6. Des jobs et services utilisent ensuite ces donnees pour fermer les fenetres, envoyer des rappels, calculer les analytics ou appliquer des restrictions.

Cette separation est bonne dans l'intention. Elle permet de distinguer l'historique, l'etat courant et la temporalite. Mais elle demande une discipline stricte : chaque entite doit avoir un role clair, sinon les bugs de synchronisation deviennent difficiles a diagnostiquer.

## `WhatsappMessage`

### Role actuel

`WhatsappMessage` stocke les messages entrants et sortants. Elle sert aussi a :

- dedupliquer les messages provider avec `message_id`, `external_id`, `provider_message_id` ;
- rattacher le message a un `chat`, un `channel`, un `poste`, un `commercial`, un `contact` ;
- gerer les statuts d'envoi : `pending`, `sent`, `delivered`, `read`, `failed`, etc. ;
- stocker les erreurs fournisseur ;
- representer les reponses citees via `quotedMessage` ;
- rattacher les medias ;
- calculer les analytics : volume, temps de reponse, performance commerciale ;
- alimenter le temps reel ;
- stocker des enrichissements comme le sentiment.

### Ce qu'elle offre

`WhatsappMessage` est la source historique la plus fiable du systeme. Elle peut offrir :

- une timeline complete de la conversation ;
- un audit des messages envoyes, livres, lus ou echoues ;
- une base pour les temps de premiere reponse ;
- une base pour la performance commerciale ;
- une base pour l'IA : resume, suggestion de reponse, detection de sentiment, classification ;
- une base pour suivre la qualite des providers et des canaux.

### Avis critique

L'entite est tres utile, mais elle est proche du role de "table universelle". Elle porte a la fois l'historique, les liens metier, les statuts provider, la lecture commerciale, l'enrichissement IA et des champs legacy.

Le point le plus critique est l'ambiguite entre :

- `message_id`
- `external_id`
- `provider_message_id`

Ces trois champs sont parfois equivalents, parfois utilises differemment. Pour une application multi-provider et multi-tenant, c'est dangereux. Le contrat devrait etre :

- `id` : identifiant interne DB.
- `provider_message_id` : identifiant canonique du fournisseur.
- `provider` : fournisseur du message.
- `tenant_id` : tenant proprietaire.
- `external_id` et `message_id` : champs legacy ou alias controles, a ne plus utiliser comme source principale.

Autre point critique : certaines recherches de deduplication ou de statut ne filtrent pas toujours par `tenant_id` + `provider` + `direction`. Si deux tenants ou providers generent un identifiant similaire, il y a un risque de collision logique.

### Recommandations pour `WhatsappMessage`

- Clarifier officiellement le contrat d'identite externe.
- Rendre les recherches provider multi-tenant par defaut.
- Eviter d'ajouter de nouveaux enrichissements directement dans la table principale.
- Creer des tables specialisees si besoin :
  - `message_delivery_event` pour l'historique des statuts provider ;
  - `message_read_receipt` pour les lectures multi-agent ;
  - `message_analysis` pour les enrichissements IA ;
  - `message_error_event` pour les erreurs detaillees.
- Garder `WhatsappMessage` comme source canonique du fait "message", pas comme conteneur de tous les usages derives.

## `WhatsappChat`

### Role actuel

`WhatsappChat` represente la conversation operationnelle. Elle porte l'etat courant utilise par les agents, le dispatcher, les sockets, les dashboards et les jobs.

Elle contient notamment :

- l'identite conversationnelle : `id`, `tenant_id`, `chat_id`, `name`, `contact_client` ;
- l'affectation : `poste_id`, `assigned_at`, `assigned_mode` ;
- le canal courant : `channel_id`, `last_msg_client_channel_id` ;
- l'etat d'interface : `is_pinned`, `is_muted`, `is_archived`, `read_only`, `not_spam` ;
- les compteurs : `unread_count`, `outboundMessageCount` ;
- le statut : `actif`, `en attente`, `ferme` ;
- le resultat metier : `conversation_result`, `conversation_result_at`, `conversation_result_by` ;
- les marqueurs de fenetre : `window_status`, `window_slot`, `windowExpiresAt`, `customerWindowExpiresAt` ;
- les marqueurs de priorite et verrouillage : `is_locked`, `is_priority` ;
- les donnees CTWA et campagne : `isCtwa`, `campaignLinkId`, `metaAdReferral` ;
- la session active : `activeSessionId`.

### Ce qu'elle offre

`WhatsappChat` est l'entite la plus utile pour l'operationnel. Elle permet :

- d'afficher rapidement la liste des conversations par poste ;
- de trier par activite recente ;
- de savoir si une conversation est active, en attente ou fermee ;
- de router les conversations vers les postes ;
- de gerer les compteurs non lus ;
- de verrouiller ou liberer une conversation ;
- de suivre le resultat commercial final ;
- d'isoler les conversations prioritaires ;
- d'eviter des joins couteux grace a des denormalisations comme `windowExpiresAt`.

Les index montrent que l'entite est bien orientee hot-path : poste + activite, statut + date, canal + activite, resultat, etc.

### Avis critique

`WhatsappChat` est aujourd'hui le vrai "tableau de bord vivant" de la conversation. C'est pertinent, mais elle concentre beaucoup d'etats derives :

- `unread_count` derive des messages entrants non lus ;
- `last_activity_at` derive des messages ;
- `last_client_message_at` et `last_poste_message_at` derivent des messages ou sessions ;
- `windowExpiresAt` derive de `ChatSession.autoCloseAt` ;
- `last_window_reminder_sent_at` derive de `ChatSession.lastWindowReminderSentAt` ;
- `activeSessionId` pointe vers la session active ;
- `read_only` est influence par la fenetre, les limites de messages, les agents et la fermeture ;
- `status` est influence par le dispatcher, les agents, les jobs et la session.

Ce n'est pas mauvais en soi. Pour une application temps reel, denormaliser est souvent necessaire. Mais cela cree un risque de divergence entre `WhatsappChat`, `WhatsappMessage` et `ChatSession`.

Exemple : si un message est sauvegarde mais que la mise a jour de session echoue en fire-and-forget, `WhatsappMessage` est correct, mais `ChatSession` ou `WhatsappChat.windowExpiresAt` peuvent etre en retard. Si le compteur non lu est incremente mais que certains messages sont marques READ autrement, `unread_count` peut diverger.

Autre point : `chat_id` est un identifiant externe/provider, mais il sert enormement de cle logique. L'entite a aussi un UUID interne `id`. Cette cohabitation est normale, mais elle doit etre stricte :

- les relations internes devraient privilegier `id` ;
- les integrations provider peuvent utiliser `chat_id` ;
- les requetes multi-tenant devraient eviter `chat_id` seul.

### Recommandations pour `WhatsappChat`

- Assumer officiellement que `WhatsappChat` est une projection operationnelle denormalisee.
- Documenter quels champs sont sources de verite et quels champs sont caches.
- Ajouter des jobs ou commandes de reconciliation pour :
  - `unread_count` ;
  - `last_activity_at` ;
  - `activeSessionId` ;
  - `windowExpiresAt` ;
  - `last_window_reminder_sent_at`.
- Eviter d'ajouter encore trop de logique historique dans `WhatsappChat`; l'historique doit rester dans `WhatsappMessage` ou `ChatSession`.
- Renforcer les recherches par `tenant_id` quand `chat_id` est utilise.
- Clarifier le cycle de vie de `status` : qui a le droit de passer en `actif`, `en attente`, `ferme`, et dans quelles conditions.

## `ChatSession`

### Role actuel

`ChatSession` represente une periode active de traitement d'une conversation. Elle est rattachee a `WhatsappChat` par `whatsappChatId`.

Elle contient :

- `startedAt` et `endedAt` ;
- `isCtwa` ;
- les informations de campagne CTWA ;
- `lastClientMessageAt` ;
- `lastPosteMessageAt` ;
- `serviceWindowExpiresAt` ;
- `freeEntryExpiresAt` ;
- `autoCloseAt` ;
- `lastWindowReminderSentAt`.

`ChatSessionService` ouvre une session, la prolonge sur message client, la ferme manuellement ou automatiquement, et synchronise certains champs dans `WhatsappChat`.

### Ce qu'elle offre

`ChatSession` est tres importante parce qu'elle donne une notion de cycle. Sans elle, `WhatsappChat` serait obligee de porter toute l'histoire des ouvertures/fermetures.

Elle permet :

- de savoir quand une periode conversationnelle a commence ;
- de savoir quand elle est terminee ;
- de gerer la fenetre normale de 24h ;
- de gerer la fenetre CTWA de 72h ;
- de declencher une fermeture automatique ;
- d'envoyer un rappel de fenetre une seule fois ;
- d'auditer les reouvertures ou nouveaux cycles d'une meme conversation.

### Avis critique

L'introduction de `ChatSession` est une bonne evolution architecturale. Elle corrige une faiblesse classique des systemes de messagerie : confondre "conversation globale" et "episode actif".

Le point positif le plus fort est l'utilisation de transactions et de verrouillage pessimiste dans `openSession`. Cela reduit le risque de sessions actives dupliquees.

Mais il y a encore des fragilites :

1. L'entite n'a pas de `tenant_id`.
   Comme elle est rattachee a `WhatsappChat`, le tenant peut etre retrouve par join. Mais pour les jobs, analytics ou audits, un `tenant_id` direct pourrait simplifier et securiser les requetes.

2. Il n'y a pas de contrainte unique forte visible cote entite pour garantir une seule session active par chat.
   Les migrations ajoutent un index `(whatsapp_chat_id, ended_at)`, mais en MySQL plusieurs `NULL` peuvent coexister dans un index non unique. Le code compense par verrouillage, mais une contrainte fonctionnelle ou une strategie plus explicite serait plus robuste.

3. Certains champs sont synchronises dans `WhatsappChat`.
   C'est utile pour la performance, mais cela cree une double source potentielle :
   - `ChatSession.autoCloseAt` ;
   - `WhatsappChat.windowExpiresAt`.

4. La gestion de session est parfois declenchee en fire-and-forget apres la persistance du message entrant.
   C'est pragmatique pour ne pas bloquer le pipeline webhook, mais cela signifie qu'un message peut etre persiste sans que la session soit immediatement correcte.

### Recommandations pour `ChatSession`

- Ajouter `tenant_id` si les sessions deviennent importantes pour les analytics ou l'audit.
- Ajouter des index explicites sur :
  - `whatsapp_chat_id`, `ended_at` ;
  - `auto_close_at`, `ended_at` ;
  - `last_window_reminder_sent_at` ;
  - eventuellement `tenant_id`, `started_at`.
- Garantir applicativement ou structurellement une seule session active par chat.
- Garder `ChatSession` comme source de verite des fenetres, et `WhatsappChat.windowExpiresAt` comme cache uniquement.
- Ajouter une reconciliation periodique : si `activeSessionId` pointe vers une session fermee, corriger le chat ; si une session active existe sans `activeSessionId`, recoller le lien.

## Interaction entre les trois entites

### Modele ideal

Le modele cible devrait etre :

- `WhatsappMessage` conserve l'historique complet des faits.
- `WhatsappChat` conserve l'etat courant utile a l'interface et au dispatch.
- `ChatSession` conserve les periodes de traitement et les fenetres temporelles.

Cette repartition est saine. Elle permet a chaque entite de repondre a une question precise :

- Que s'est-il passe ? `WhatsappMessage`
- Ou en est la conversation maintenant ? `WhatsappChat`
- Dans quel cycle/fenetre de traitement sommes-nous ? `ChatSession`

### Risque principal : divergence d'etat

Le risque principal n'est pas le manque de donnees. Le risque est d'avoir trop de donnees redondantes sans reconciliation systematique.

Champs sensibles :

- `WhatsappChat.unread_count` vs messages entrants non lus ;
- `WhatsappChat.last_activity_at` vs dernier `WhatsappMessage` ;
- `WhatsappChat.last_client_message_at` vs `ChatSession.lastClientMessageAt` vs dernier message IN ;
- `WhatsappChat.last_poste_message_at` vs `ChatSession.lastPosteMessageAt` vs dernier message OUT ;
- `WhatsappChat.windowExpiresAt` vs `ChatSession.autoCloseAt` ;
- `WhatsappChat.last_window_reminder_sent_at` vs `ChatSession.lastWindowReminderSentAt` ;
- `WhatsappChat.activeSessionId` vs session active reelle ;
- `WhatsappChat.status` vs `ChatSession.endedAt`.

Ces redondances peuvent etre acceptees, mais elles doivent etre traitees comme des projections. Une projection peut etre en retard ; il faut donc pouvoir la reconstruire.

### Risque secondaire : identifiants externes trop presents

`chat_id`, `channel_id`, `provider_message_id` sont necessaires, mais ils ne doivent pas remplacer partout les UUID internes. Le systeme gagnerait en robustesse avec cette regle :

- relations internes : UUID internes (`WhatsappChat.id`, `WhatsappMessage.id`, `ChatSession.id`) ;
- integrations provider : IDs externes (`chat_id`, `provider_message_id`, `channel_id`) ;
- toutes les recherches externes importantes : filtre par `tenant_id` + `provider` quand possible.

## Possibilites fonctionnelles offertes par les trois entites

### 1. Pilotage commercial complet

En combinant les trois entites, le projet peut produire :

- nombre de conversations ouvertes/fermees ;
- conversations en retard ;
- conversations proches de l'expiration ;
- temps de premiere reponse ;
- temps entre lecture et reponse ;
- volume par commercial ;
- volume par poste ;
- taux de fermeture par resultat metier ;
- taux de messages echoues ;
- performance par canal.

### 2. Qualite de service et SLA

`WhatsappChat` donne l'etat courant, `ChatSession` donne les deadlines, `WhatsappMessage` donne les faits. Ensemble, elles permettent :

- alertes avant expiration de fenetre ;
- fermeture automatique ;
- relance des conversations sans reponse ;
- detection des conversations bloquees ;
- ranking des conversations prioritaires ;
- suivi des SLA par poste ou commercial.

### 3. IA conversationnelle

`WhatsappMessage` fournit le contenu, `WhatsappChat` fournit le contexte operationnel, `ChatSession` fournit le cycle courant.

Cela permet :

- resume de session active ;
- resume global de conversation ;
- suggestion de prochaine reponse ;
- detection d'intention client ;
- detection d'insatisfaction ;
- extraction de resultat probable ;
- assistant de cloture de conversation.

Il faut toutefois stocker les resultats IA dans une table dediee, pas tout ajouter dans les trois entites centrales.

### 4. Audit et conformite

Le trio peut offrir une tracabilite forte :

- message recu/envoye ;
- statut provider ;
- commercial responsable ;
- moment de lecture ;
- debut et fin de session ;
- fenetre de service ;
- resultat de conversation ;
- canal source.

Pour aller plus loin, il faudrait historiser davantage les transitions de statut de `WhatsappChat` et les evenements provider de `WhatsappMessage`.

## Avis critique final

Les trois entites sont globalement bien choisies. Elles correspondent a trois concepts metier importants :

- le message ;
- la conversation ;
- la session de conversation.

Le projet a donc une bonne base. Le vrai enjeu n'est pas de remplacer ces entites, mais de mieux fixer leurs frontieres.

Mon avis :

- `WhatsappMessage` doit rester la source canonique des faits de messagerie.
- `WhatsappChat` doit etre assume comme une projection operationnelle denormalisee.
- `ChatSession` doit devenir la source de verite des fenetres temporelles et episodes de traitement.

La dette principale est la redondance non formalisee. Plusieurs champs existent a la fois dans `WhatsappChat`, `WhatsappMessage` et `ChatSession`. Cette redondance est acceptable pour la performance, mais seulement si le projet ajoute :

- une documentation claire des sources de verite ;
- des jobs de reconciliation ;
- des contraintes/index adaptes ;
- une regle stricte sur les identifiants internes vs externes ;
- une discipline multi-tenant plus forte.

## Priorites recommandees

### Priorite 1 : documenter les sources de verite

Proposition :

- Historique des messages : `WhatsappMessage`.
- Etat courant d'une conversation : `WhatsappChat`.
- Fenetre active et cycle conversationnel : `ChatSession`.
- Donnees denormalisees pour performance : clairement marquees comme caches.

### Priorite 2 : clarifier les identifiants

Pour `WhatsappMessage` :

- canoniser `provider_message_id` ;
- reduire l'usage de `message_id` et `external_id`.

Pour `WhatsappChat` :

- utiliser `id` pour les relations internes ;
- utiliser `chat_id` pour le provider et l'affichage metier ;
- filtrer par `tenant_id` quand disponible.

Pour `ChatSession` :

- garder `whatsappChatId` comme FK interne ;
- envisager `tenant_id` pour audit/analytics.

### Priorite 3 : ajouter une reconciliation periodique

Un job technique devrait verifier et corriger :

- unread count ;
- dernier message / derniere activite ;
- session active ;
- fenetre expiree ;
- cache `windowExpiresAt` ;
- statut ferme avec session encore ouverte ;
- session ouverte sans chat actif.

### Priorite 4 : sortir les historiques secondaires

Ne pas surcharger les trois entites centrales avec tout :

- lectures detaillees : table dediee ;
- statuts provider successifs : table dediee ;
- transitions de conversation : table d'audit ;
- analyses IA : table dediee ;
- agregats analytics : snapshots.

### Priorite 5 : renforcer les garanties concurrentes

Les webhooks et sockets peuvent arriver en parallele. Il faut donc securiser :

- deduplication message ;
- ouverture de session ;
- increment unread ;
- fermeture automatique ;
- changement de statut ;
- mise a jour `activeSessionId`.

Le verrouillage actuel de `openSession` est un bon point. Il faut appliquer le meme niveau de rigueur aux autres chemins critiques.

## Conclusion

Ces trois entites peuvent offrir une base tres puissante : messagerie temps reel, pilotage commercial, SLA, automatisation, IA, audit et analyse des performances.

Mais leur puissance vient avec une exigence : ne pas les laisser devenir trois tables fourre-tout. La bonne direction est de garder :

- `WhatsappMessage` pour les faits ;
- `WhatsappChat` pour la projection vivante ;
- `ChatSession` pour le cycle temporel.

Avec cette discipline, le projet peut evoluer proprement vers plus de providers, plus de tenants, plus d'automatisation et plus d'analytics sans rendre le backend fragile.
