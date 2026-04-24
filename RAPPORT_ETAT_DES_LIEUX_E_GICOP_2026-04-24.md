# Rapport d'Etat des Lieux E-GICOP

Date: 2026-04-24

## Synthèse

Le projet n'est pas un simple prototype. C'est un monorepo structuré avec un backend NestJS `message_whatsapp`, un front opérateur `front` et un back-office `admin`. La base fonctionnelle "chat commercial / dispatch / suivi client" est déjà bien avancée, mais la plateforme reste partiellement alignée avec le besoin E-GICOP. En l'état, elle couvre surtout le noyau conversationnel; elle ne couvre pas encore complètement la gouvernance commerciale, les RH/temps de travail, les plaintes, ni plusieurs automatismes métier clés.

Le point le plus important: le projet est plus mature sur les APIs et règles backend que sur l'expérience métier complète demandée.

## Ce qui est déjà bien couvert

- Affectation durable d'une conversation au même poste: implémenté côté dispatch, avec affinité et retour systématique au poste initial [assign-conversation.use-case.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/dispatcher/application/assign-conversation.use-case.ts:80).
- Restriction "10 conversations actives max": implémentée via quotas de capacité/fenêtre glissante [conversation-capacity.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/conversation-capacity/conversation-capacity.service.ts:10).
- Rapport conversation / dossier client obligatoire: présent côté backend et UI opérateur [conversation-report.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-report/conversation-report.service.ts:1), [GicopReportPanel.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/GicopReportPanel.tsx:1).
- Champs métier de relance/prospect/client annulé/livré: présents via `client_dossier`, `follow_up`, `contact.client_category` [client-dossier.entity.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/client-dossier/entities/client-dossier.entity.ts:1), [follow_up.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/follow-up/follow_up.service.ts:1), [contact.entity.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/contact/entities/contact.entity.ts:1).
- Obligations d'appels "5 annulées + 5 livrées + 5 sans commande >= 90s" et contrôle qualité des 10 dernières conversations: bien implémentés [call-obligation.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/call-obligations/call-obligation.service.ts:1), [window-rotation.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/window/services/window-rotation.service.ts:1).
- Objectifs et ranking: base existante, avec API, scoring et widgets front/admin [targets.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/targets/targets.service.ts:1), [ObjectifsPanel.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/ObjectifsPanel.tsx:1), [RankingPositionWidget.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/RankingPositionWidget.tsx:1).
- Catalogue d'informations à envoyer au client, avec média: présent via `catalog` + réponses rapides + médias [catalog.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/catalog/catalog.controller.ts:1), [CannedResponseMenu.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/CannedResponseMenu.tsx:1).
- Sessions commerciales et restriction géographique de connexion: présentes [auth.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/auth/auth.controller.ts:1), [geo_access.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/geo-access/geo_access.service.ts:1), [commercial_session.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/commercial-session/commercial_session.service.ts:1).

## Écarts majeurs par rapport au cahier des charges

- Double vérification par email à chaque connexion: absente. Le login commercial est email+mot de passe+géolocalisation, sans OTP/email challenge [auth.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/auth/auth.controller.ts:1).
- Sécurité contournable: il existe un `auto-login` par token dérivé email/téléphone, accessible côté page dédiée [auto_connexion/page.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/app/auto_connexion/page.tsx:1), [whatsapp_commercial.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/whatsapp_commercial/whatsapp_commercial.service.ts:59). C'est incompatible avec une exigence "bureau seulement + double vérification stricte".
- Typologie utilisateurs "stagiaire" vs "vendeuse confirmée" avec impact rémunération: non identifiée dans le modèle actuel. Je n'ai pas trouvé d'attribut métier dédié sur le commercial.
- Dashboard demandé: partiel seulement. Il y a objectifs/ranking/statistiques de base, mais pas le dashboard central exact demandé avec barre fixe mensuelle/journalière, top par groupe 1/groupe 2, ni l'ensemble des KPI métier listés.
- Heures de travail / pauses / emploi du temps: très partiel. Le projet trace des sessions de connexion, mais pas les 4 jalons journaliers requis (arrivée, départ pause, retour pause, départ maison), ni la planification des créneaux de pause par groupe.
- Potentiel client / commande annulée / client à relancer: partiellement couvert en données, mais pas sous forme de menus métier dédiés et complets conformes au cahier.
- Comptes certifiés: partiel. Il y a un statut de certification et une remontée ERP [inbound-integration.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/inbound-integration/inbound-integration.service.ts:1), mais pas de workflow complet de contrôle des doublons de noms, photos avant/après, email obligatoire, validation logistique détaillée.
- Plaintes: absent. Je n'ai pas trouvé de module plainte/réclamation.
- Appels en absence et messages arrivés sur le poste à traiter avant tout: non matérialisés comme workflow prioritaire dédié. Il y a du non-lu, de l'audio et des call events, mais pas le circuit métier imposé.
- Notation client automatique en fin de conversation: non trouvée.
- Envoi automatique d'un rappel à la date de relance, récap commande + photo produit, code d'expédition: non trouvés comme automatisations métier branchées.
- Erreur sur commande: il existe un module `whatsapp_error`, mais il ne correspond pas clairement au workflow métier "reprendre la livraison / annuler / reprogrammer".

## Évaluation par bloc

- Gestion des comptes utilisateurs: `Partiel`
- Sécurité accès bureau: `Partiel`
- Double vérification email: `Absent`
- Dashboard commercial E-GICOP: `Partiel`
- Temps de travail / planning / pauses: `Faible`
- Chat WhatsApp amélioré: `Bon niveau backend, UI partielle`
- Relances prospects / annulés / anciens clients: `Partiel`
- Appels en absence / messages prioritaires: `Faible`
- Enregistrement et monitoring des appels: `Partiel`
- Comptes certifiés: `Partiel`
- Plaintes: `Absent`

## État technique

- Le backend TypeScript compile localement via `tsc` sans erreur.
- Le front `front` ne build pas en environnement fermé car `next/font` tente de charger `Geist` depuis Google Fonts.
- L'admin compile le code Next, mais le build échoue ensuite sur un `spawn EPERM` dans cet environnement; ce n'est pas forcément un bug fonctionnel applicatif.

## Conclusion

Si ton objectif est "x20 les ventes en 90 jours", la base actuelle peut servir de socle pour la partie conversationnelle et pilotage commercial. En revanche, le produit n'est pas encore aligné avec le process opérationnel GICOP complet. Il manque surtout la couche de discipline métier: sécurité forte, segmentation RH des commerciaux, dashboard KPI exhaustif, workflow prioritaire des rappels/messages, comptes certifiés complets, plaintes, et automatisations post-conversation/post-commande.

La bonne lecture du projet aujourd'hui est: socle chat/dispatch solide, CRM commercial intermédiaire, plateforme E-GICOP complète non encore atteinte.

## Suites possibles

1. Matrice "exigence par exigence" avec statut `OK / Partiel / KO`.
2. Roadmap priorisée 30/60/90 jours.
3. Backlog technique détaillé par module à développer.
