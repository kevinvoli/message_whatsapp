# Rapport : flux d'envoi de message WhatsApp

Ce rapport regroupe l'observation front + backend et s'appuie aussi sur la documentation docs/bilan-front.md (point de vue WhatsApp UI) et docs/bilan-backend.md + docs/analyse-prerequis-whatsapp-conversation.md (point de vue Whapi/WhatsApp provider, notamment la partie idempotence et mapping des channels).

## 1. Vue globale
- Front : ront/src/components/chat/ChatInput.tsx capture le texte/media, declenche onSendMessage, gere typing + media/vocal + affichage optimiste et repose sur chatStore pour emettre message:send et reagir aux mises a jour socket (cf. WebSocketEvents.tsx).
- Backend : message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts expose message:send, verifie SocketThrottleGuard, resout tenant/channel, puis delegue a WhatsappMessageService.createAgentMessage() (route via communication_whapi/outbound-router.service.ts qui choisit Whapi vs Meta) et emet ensuite MESSAGE_ADD + CONVERSATION_UPSERT pour mettre a jour la liste sur le front.
- Documentation : docs/bilan-front.md confirme que l'UI traite les evenements bus chat:event et que l'envoi via whapiSender/metaSender est couvre, docs/bilan-backend.md rappelle que le systeme est multi-provider (Whapi + Meta) et qu'une couche de routeur/outbound gere la selection. docs/analyse-prerequis-whatsapp-conversation.md precise que l'on doit enregistrer un channel Whapi/Meta et maintenir le mapping provider<->tenant avant d'accepter les webhooks.

## 2. Sequence d'envoi texte
1. L'utilisateur tape et envoie ; ChatInput.handleSubmit appelle useChatStore().sendMessage(), qui ajoute un message status: sending, genere un 	empId, puis emet socket.emit('message:send', { chat_id, text, tempId }).
2. Gateway socket (WhatsappMessageGateway.handleSendMessage) rate-limit, recupere le chat/channel, empeche les doublons via la cle normalisee pendingKey = ${chat_id}:`, et appelle createAgentMessage.
3. createAgentMessage (service) :
   - appelle OutboundRouterService.sendTextMessage() (choix Whapi/Meta). 
   - persiste le message (status SENT, provider_message_id).
   - met a jour la conversation (
ead_only, last_activity_at).
4. Gateway emet MESSAGE_ADD (avec 	empId) + CONVERSATION_UPSERT vers toutes les rooms tenant.
5. Front (WebSocketEvents) remplace le message optimiste via 	empId, met a jour la conversation, et affiche les statuts (incluant la future MESSAGE_STATUS_UPDATE).

## 3. Envoi media/vocal
- ChatInput utilise uploadMedia() (POST /messages/media) puis WhatsappMessageController.uploadMedia() pour verifier le channel ; le controller appelle WhatsappMessageService.createAgentMediaMessage() et enfin gateway.notifyNewMessage(message, chat).
- createAgentMediaMessage envoie via OutboundRouterService.sendMediaMessage() (Whapi vs Meta), persiste message + media local, stocke un fichier dans /uploads, puis renvoie un WhatsappMessage avec les medias (cf. mediaRepository).
- 
otifyNewMessage declenche MESSAGE_ADD + CONVERSATION_UPSERT, ce qui fait apparaitre la piece jointe sur le front.

## 4. Gestion des duplications
- Front/back : le front envoie un 	empId unique pour distinguer les messages optimistes, mais la protection principale est cote serveur (cf. pendingAgentMessages dans message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts lignes 62-603). Le gateway empeche plusieurs envois identiques simultanes (meme texte + chat) en verifiant 	his.pendingAgentMessages.has(pendingKey), et ne libere la cle qu'apres le 	ry/finally. Si un doublon survient, la requete est ignoree et un log/warning (Duplicate send blocked) est genere.
- Whapi : sur le plan webhook, WhapiController appelle 	his.whapiService.isReplayEvent(...) avant de traiter une notification (voir message_whatsapp/src/whapi/whapi.controller.ts lignes 60 et 242). docs/bilan-backend.md rappelle le role de WebhookIdempotencyService et du circuit breaker (WebhookTrafficHealthService, WebhookRateLimitService) pour eviter la reinjection multiple d'un meme message a cause d'un replay ou d'une duplication du provider.
- Documentation : docs/analyse-prerequis-whatsapp-conversation.md indique qu'une conversation ne sera pas consideree si le mapping provider/tenant est absent, ce qui entraine des erreurs 422 et force un repli securise des la creation du channel (cela empeche les doublons d'etre traites sans contexte tenant). Ainsi, la prevention des doublons combine la couche socket (pendingAgentMessages) et la couche webhook/Whapi (isReplayEvent).

## 5. Risques / actions immediates
- Si un agent clique trop vite sur envoyer (doublon textuel) : la cle pendingAgentMessages protege, mais il faut verifier que la cle nettoie bien sur toutes les branches d'erreur (actuellement, inally supprime la cle, donc OK).
- Si Whapi reemet un webhook (reseau instable), isReplayEvent et WebhookIdempotencyService garantissent que la charge n'est pas reappliquee.
- Pour renforcer la tracabilite, on peut logger le pendingKey + 	empId cote front, ou ajouter un metrique dedie dans WhatsappMessageGateway.emitRateLimited.

## 6. Pistes de suivi
1. Ajouter un test e2e (message-flow) qui envoie deux fois le meme payload message:send et valide que seul un message persiste (pendingAgentMessages se declenche).
2. Documenter clairement le comportement anti-doublon dans docs/bilan-backend.md et docs/analyse-prerequis-whatsapp-conversation.md pour guider les equipes ops si Whapi/WhatsApp renvoie plusieurs webhooks.
3. Sur le front, faire remonter au minimum un toast quand MESSAGE_SEND_ERROR arrive pour que l'agent sache pourquoi son message n'a pas ete traite (complement a la protection existante).

*Document cree automatiquement a partir des fichiers existants et du code courant.*
