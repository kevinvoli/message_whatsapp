# Rapport Fonctionnalites Messagerie E-GICOP

Date: 2026-04-24

## Perimetre

Ce rapport couvre uniquement les fonctionnalites directement liees au projet de messagerie:

- reception et traitement des messages
- affectation des conversations
- interface operateur WhatsApp
- relances et suivi client dans le chat
- appels lies au traitement commercial
- capacite de traitement par poste
- automatisations liees au flux conversationnel

Ne sont pas couverts ici:

- gestion RH complete
- paie / remuneration
- emploi du temps global
- gouvernance generale hors messagerie
- plaintes generalistes non integrees au flux chat

## Synthese

Le projet de messagerie est deja bien avance sur son coeur fonctionnel. Le backend couvre une grande partie des mecanismes critiques: reception des messages, dispatch, conservation de l'affectation au meme poste, limitation de charge, dossier client, relances, appels et controles de qualite. En revanche, plusieurs attentes metier E-GICOP restent encore partielles ou absentes, surtout sur les automatismes metier de fin de conversation, les workflows prioritaires "avant toute autre action", et certaines interfaces dediees.

La lecture correcte du perimetre messagerie est la suivante: socle technique solide, logique operationnelle deja structuree, mais produit metier encore incomplet par rapport au besoin cible.

## Fonctionnalites messagerie deja couvertes

### 1. Reception et persistance des messages

- Pipeline de reception unifie, persistance des messages entrants et medias.
- Gestion du temps reel via sockets.
- Gestion des non lus et mise a jour de l'etat de conversation.

References:

- [inbound-message.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/webhooks/inbound-message.service.ts:1)
- [incoming-message-persistence.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/ingress/infrastructure/incoming-message-persistence.service.ts:1)
- [media-persistence.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/ingress/infrastructure/media-persistence.service.ts:1)

### 2. Affectation des conversations et permanence du poste

- Une conversation deja affectee revient toujours sur le meme poste.
- La premiere affectation est memorisee et reutilisee.
- L'affinite de contact est prise en compte.
- La conversation peut rester attachee au poste meme si l'agent est hors ligne.

References:

- [assign-conversation.use-case.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/dispatcher/application/assign-conversation.use-case.ts:1)
- [contact-assignment-affinity.entity.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/dispatcher/entities/contact-assignment-affinity.entity.ts:1)

### 3. Limitation de charge et capacite de traitement

- Limitation des conversations actives par poste.
- Quota actif par defaut correspondant a la contrainte de charge.
- Gestion d'une fenetre glissante avec conversations actives, verrouillees et validees.

References:

- [conversation-capacity.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/conversation-capacity/conversation-capacity.service.ts:1)
- [window-rotation.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/window/services/window-rotation.service.ts:1)

### 4. Interface operateur de chat

- Interface de conversation en temps reel.
- Historique des messages et medias.
- Envoi de texte, documents, image, video, audio.
- Enregistrement vocal depuis l'interface.
- Panneau dossier client dans la zone de chat.

References:

- [page.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/app/whatsapp/page.tsx:1)
- [ChatMainArea.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/ChatMainArea.tsx:1)
- [ChatInput.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/ChatInput.tsx:1)
- [ChatMessages.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/ChatMessages.tsx:1)

### 5. Rapport conversationnel et dossier client

- Formulaire de dossier client directement lie a la conversation.
- Champs presents:
  - nom et prenoms
  - ville / commune / quartier
  - categorie produit
  - autres numeros
  - besoin client
  - score d'interet sur 5
  - indicateur homme non interesse
  - date de relance
  - prochaine action
  - notes
- Historique d'appels associe.
- Blocage possible de certaines actions si le dossier est incomplet.

References:

- [GicopReportPanel.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/GicopReportPanel.tsx:1)
- [client-dossier.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/client-dossier/client-dossier.service.ts:1)
- [conversation-report.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/gicop-report/conversation-report.service.ts:1)

### 6. Relances commerciales

- Creation de relances planifiees.
- Vue "mes relances".
- Completion et annulation.
- Gestion des relances en retard.
- Typologies de relance presentes:
  - post-conversation
  - sans commande
  - post-annulation
  - fidelisation
  - sans reponse

References:

- [follow_up.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/follow-up/follow_up.service.ts:1)
- [FollowUpPanel.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/FollowUpPanel.tsx:1)

### 7. Appels et obligations de traitement

- Gestion d'evenements d'appel.
- Correlation appel <-> conversation.
- Prise en compte de la duree d'appel.
- Batchs d'obligations d'appels:
  - 5 clientes commande annulee
  - 5 clientes avec commande livree
  - 5 clientes sans commande
- Seuil minimum de 90 secondes par appel.
- Controle qualite: le commercial doit garder la derniere reponse sur les conversations actives.

References:

- [call-event.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/window/services/call-event.service.ts:1)
- [call-obligation.service.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/call-obligations/call-obligation.service.ts:1)
- [ObligationProgressBar.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/sidebar/ObligationProgressBar.tsx:1)

### 8. Reponses rapides et envoi d'informations types

- Menu de reponses rapides.
- Catalogue d'assets d'information.
- Support texte, image, video, document, audio.
- Base compatible avec les usages "carte de visite", "consignes d'utilisation", "numero depot", etc.

References:

- [CannedResponseMenu.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/chat/CannedResponseMenu.tsx:1)
- [catalog.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/catalog/catalog.controller.ts:1)

### 9. Recherche client et portefeuille conversationnel

- Vue contacts liee a l'activite commerciale.
- Dossier, timeline, historique de medias et relances.
- Categorie client et certification visibles.

References:

- [ContactDetailView.tsx](C:/Users/gbamb/Desktop/projet/whatsapp/front/src/components/contacts/ContactDetailView.tsx:1)
- [client-dossier.controller.ts](C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/client-dossier/client-dossier.controller.ts:1)

## Fonctionnalites messagerie partiellement couvertes

### 1. Workflow "potentiel client", "commande annulee", "client a relancer"

Le modele de donnees permet deja de distinguer plusieurs categories de clients:

- jamais commande
- commande sans livraison
- commande avec livraison
- commande annulee

Mais il manque encore des menus operateurs totalement dedies, avec experience metier stricte alignee sur le cahier des charges.

Statut: `Partiel`

### 2. Priorite absolue aux appels en absence et messages recus sur le poste

Le projet gere:

- les messages non lus
- les appels et call events
- les compteurs de conversations

Mais je n'ai pas trouve de mecanisme fort imposant dans l'UI ou la logique metier:

- "rappeler les appels en absence avant toute autre action"
- "traiter les messages venus sur ce telephone avant toute autre action"

Statut: `Faible a partiel`

### 3. Monitoring des appels

Le projet trace des appels et evenements d'appel, avec URL d'enregistrement possible dans les call events. En revanche, le workflow global "toutes les commandes doivent etre enregistrees par commercial pour monitoring constant" n'apparait pas encore comme un processus metier complet et visible de bout en bout.

Statut: `Partiel`

### 4. Qualification metier et fermeture de conversation

Il existe:

- resultats de conversation
- controles de validation
- blocages si dossier incomplet

Mais la fermeture conversationnelle E-GICOP complete semble encore dependre de plusieurs briques separees, pas encore totalement unifiees dans une UX simple et rigide.

Statut: `Partiel`

## Fonctionnalites messagerie absentes ou non trouvees

### 1. Notation client automatique de fin de conversation

Je n'ai pas trouve de systeme qui envoie automatiquement une demande de note au client a la fin de chaque conversation.

Statut: `Absent`

### 2. Rappel automatique a la date de relance

Les relances existent en base et dans l'interface, mais je n'ai pas trouve l'automatisation d'envoi d'un message de rappel a la date choisie par le commercial.

Statut: `Absent ou non branche`

### 3. Envoi automatique du recapitulatif de commande avec photo produit

Je n'ai pas trouve de workflow branche qui detecte une commande sur nouvelle conversation encore dans la fenetre 24h et envoie automatiquement:

- le recapitulatif
- la photo du produit

Statut: `Absent ou non trouve`

### 4. Envoi automatique du code d'expedition

Je n'ai pas trouve de mecanisme clairement integre pour envoyer automatiquement au client son code d'expedition des qu'il est genere.

Statut: `Absent ou non trouve`

### 5. Workflow dedie "erreur sur commande"

Un module `whatsapp_error` existe techniquement, mais il ne materialise pas clairement le process metier attendu:

- joindre la cliente
- reprogrammer la livraison
- annuler et relancer
- annuler la commande

Statut: `Partiel faible`

## Evaluation ciblee du projet de messagerie

- Reception et stockage des messages: `OK`
- Dispatch et reaffectation au meme poste: `OK`
- Limitation a 10 conversations simultanees: `OK`
- Interface chat operateur: `OK`
- Dossier client / rapport conversation: `OK`
- Relances commerciales: `OK`
- Appels et obligations de relance telephonique: `OK`
- Menus metier dedies prospects / annules / anciens clients: `Partiel`
- Priorisation appels en absence / messages poste: `Faible`
- Notation automatique client: `Absent`
- Automatisation rappel de relance: `Absent`
- Envoi recap commande + photo: `Absent`
- Envoi code expedition: `Absent`

## Conclusion

Si on isole uniquement le projet de messagerie, l'etat actuel est globalement bon sur le socle operationnel. La plateforme sait deja recevoir, router, suivre et encadrer le travail des commerciaux dans le chat. Elle couvre bien les besoins techniques de conversation, de charge, de suivi client et de relance.

En revanche, la couche "automatisations metier GICOP" n'est pas encore complete. C'est la principale zone d'ecart dans le perimetre messagerie. Autrement dit:

- la messagerie conversationnelle est deja exploitable
- la messagerie commerciale GICOP complete ne l'est pas encore totalement

## Recommandation prioritaire sur le seul perimetre messagerie

1. Ajouter les automatismes metier manquants:
   - rappel automatique de relance
   - note client de fin de conversation
   - recap commande + photo produit
   - envoi code expedition
2. Creer des vues operateur dediees:
   - potentiels clients
   - commandes annulees
   - anciens clients a relancer
   - appels en absence
   - messages prioritaires du poste
3. Unifier le workflow de cloture conversationnelle pour imposer le process metier complet sans ambiguite.
