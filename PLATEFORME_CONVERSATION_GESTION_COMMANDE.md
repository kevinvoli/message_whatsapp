# Specification Detaillee Des Donnees A Echanger Entre La Plateforme Conversationnelle Et La Plateforme De Gestion Des Commandes

Date: 20 avril 2026

## 1. Objet du document

Ce document a pour objectif de preciser en detail les donnees qui devront etre echangees entre:
- la plateforme conversationnelle
- la plateforme de gestion des commandes

Le contexte actuel est le suivant:
- l'application installee sur les telephones de l'entreprise communique deja avec la plateforme de gestion des commandes
- les applications livreur et gestion de stock communiquent deja avec la plateforme de gestion des commandes
- seule la plateforme conversationnelle ne communique pas encore avec la plateforme de gestion des commandes

L'objectif est donc de definir clairement:
- quelles donnees la plateforme conversationnelle doit envoyer a la plateforme de gestion des commandes
- quelles donnees la plateforme de gestion des commandes doit envoyer a la plateforme conversationnelle
- a quel moment les echanges doivent se produire
- quelle plateforme est responsable de quelle donnee

Regles de vocabulaire retenues pour ce document:
- on utilise toujours le mot `client`
- on n'utilise pas le mot `customer` dans les structures de donnees cibles

Precisions importantes:
- la plateforme conversationnelle utilise des identifiants de type `UUID string`
- la plateforme de gestion des commandes utilise des identifiants de type `integer`
- le mode de communication prevu entre les deux plateformes est le `webhook`

Cette difference d'identifiants doit etre prise en compte explicitement dans les echanges.

---

## 2. Contexte metier

Le parcours actuel fonctionne globalement ainsi:
- le client arrive via publicite sur WhatsApp, Messenger ou autre canal
- le commercial discute avec lui via la plateforme conversationnelle
- le commercial peut ensuite appeler le client a l'aide des telephones de l'entreprise
- la commande est ensuite saisie dans la plateforme de gestion des commandes
- les etapes logistiques et de livraison sont gerees dans d'autres applications deja connectees a la plateforme de gestion des commandes

Le besoin principal est de ne plus avoir de rupture entre:
- la phase de conversation et de qualification commerciale
- la phase de prise de commande
- la phase de suivi de commande et de livraison

La plateforme conversationnelle doit donc devenir un point d'entree commercial connecte au reste du systeme.

---

## 3. Perimetre de cette integration

Cette integration couvre uniquement les echanges entre:
- la plateforme conversationnelle
- la plateforme de gestion des commandes

Elle ne remplace pas les echanges deja existants entre:
- l'application telephonique et la plateforme de gestion des commandes
- les applications livreur et stock et la plateforme de gestion des commandes

Elle doit au contraire s'inserer proprement dans cet ecosysteme.

---

## 4. Principe general d'architecture

Le principe recommande est le suivant.

### 4.1. Role de la plateforme conversationnelle

Elle gere principalement:
- l'entree des prospects
- les echanges commerciaux
- les informations de qualification
- le suivi des conversations
- les rappels et relances
- le portefeuille commercial
- le dossier relationnel client
- les messages automatiques envoyes aux clients

### 4.2. Role de la plateforme de gestion des commandes

Elle gere principalement:
- la creation de commande
- le detail des produits commandes
- les montants
- le traitement operationnel de la commande
- la preparation
- la livraison
- les annulations
- le statut logistique

### 4.3. Regle cle

Chaque donnee doit avoir une seule plateforme maitre.

Exemple:
- la conversation et son historique appartiennent a la plateforme conversationnelle
- la commande et son traitement appartiennent a la plateforme de gestion des commandes

L'autre plateforme peut recevoir une copie utile, mais ne doit pas devenir source de verite sur la donnee maitre.

### 4.4. Mode d'integration retenu

Le mode de communication retenu entre la plateforme conversationnelle et la plateforme de gestion des commandes est base sur des `webhooks`.

Cela signifie que:
- lorsqu'un evenement metier se produit sur une plateforme, cette plateforme notifie l'autre via un webhook
- les echanges sont principalement orientes evenements
- chaque webhook doit porter un payload structure, horodate et tracable

Consequences directes:
- les evenements metier doivent etre definis clairement
- les donnees minimum necessaires doivent etre presentes dans chaque notification
- les deux plateformes doivent gerer les echecs, doublons, retries et confirmations de bonne reception

---

## 5. Principes de gouvernance des donnees

## 5.1. Identifiants de liaison obligatoires

Pour que les deux plateformes communiquent correctement, il faut des identifiants de liaison communs.

Les identifiants minimum a prevoir sont:
- `conversation_client_id` cote plateforme conversationnelle
- `order_client_id` cote plateforme de gestion des commandes
- un identifiant de correspondance commun entre les deux si disponible
- `conversation_id` ou `chat_id`
- `lead_id` si un prospect existe avant d'etre reconnu comme client
- `order_id`
- `commercial_id`
- `phone_number`

Pour les commerciaux, il faut aussi prevoir une logique de correlation inter-plateformes.

Identifiants minimum a prevoir pour un commercial:
- `conversation_commercial_id` cote plateforme conversationnelle
- `order_commercial_id` cote plateforme de gestion des commandes
- `commercial_phone_number`
- `commercial_phone_number_normalized`

### Regle obligatoire de correlation et de mapping d'identifiants

Comme les deux plateformes n'utilisent pas le meme type d'identifiant, il ne faut pas supposer qu'un seul `client_id` natif puisse suffire.

Il faut donc prevoir un mecanisme explicite de correspondance, par exemple:
- `conversation_client_id` : UUID string
- `order_client_id` : integer
- `client_reference_code` : reference fonctionnelle commune si disponible

Recommandation forte:
- creer une table ou un registre de mapping entre les identifiants des deux plateformes

Exemple conceptuel:
- `conversation_client_id`
- `order_client_id`
- `phone_number_normalized`
- `phone_number_type`
- `client_reference_code`
- `created_at`
- `updated_at`
- `mapping_status`

Sans ce mapping, la synchronisation sera fragile et source de doublons.

### Regle de correlation retenue

La decision retenue est la suivante:
- la correlation entre le client de la plateforme conversationnelle et le client de la plateforme de gestion des commandes se base d'abord sur le numero de telephone

Cela implique:
- le numero de telephone devient la cle fonctionnelle principale de rapprochement
- tous les numeros doivent etre normalises dans un format commun avant comparaison
- il faut gerer le cas ou un meme client possede plusieurs numeros

### Cas particulier important

Le client peut ajouter d'autres numeros en plus du numero utilise au depart pour converser.

Le systeme doit donc distinguer:
- le numero d'origine de la conversation
- les numeros additionnels declares plus tard
- le numero principal retenu pour le suivi commercial ou la commande

Recommandation metier:
- un client peut avoir plusieurs numeros
- un numero doit etre qualifie par type ou role

Exemples de roles possibles:
- `conversation_origin`
- `principal`
- `secondaire`
- `livraison`
- `whatsapp`
- `appel`

### Regle de rapprochement recommandee

Ordre de correlation recommande:
1. par numero de telephone normalise
2. par numero additionnel deja rattache au meme client
3. par `client_reference_code` si disponible
4. par rapprochement controle manuel si ambiguite

### Regle anti-doublon

Si un numero de telephone existe deja dans la plateforme de gestion des commandes:
- il ne faut pas recreer un nouveau client sans verification

Si un client ajoute un nouveau numero:
- ce numero doit etre rattache au client existant
- il doit ensuite etre synchronise vers l'autre plateforme

### Besoin de modelisation

Pour tenir compte de cette decision, il est recommande de gerer une liste de numeros par client et non un seul numero fixe.

Structure minimale recommandee:
- `client_phone_id`
- `conversation_client_id` si connu
- `order_client_id` si connu
- `phone_number_raw`
- `phone_number_normalized`
- `phone_number_type`
- `is_primary`
- `is_verified`
- `created_at`
- `updated_at`

### Regle de correlation retenue pour les commerciaux

La decision retenue est la suivante:
- la correlation entre le commercial de la plateforme conversationnelle et le commercial de la plateforme de gestion des commandes se base aussi sur le numero de telephone du commercial

Cela implique:
- le numero du commercial devient la cle fonctionnelle principale de rapprochement entre les deux plateformes
- les numeros des commerciaux doivent etre normalises avant comparaison
- il faut eviter qu'un meme commercial existe en doublon avec plusieurs references non reliees

### Regle de rapprochement recommandee pour les commerciaux

Ordre de correlation recommande:
1. par numero de telephone normalise du commercial
2. par table de mapping `conversation_commercial_id <-> order_commercial_id`
3. par rapprochement controle manuel si ambiguite

### Structure minimale recommandee pour le mapping commercial

- `conversation_commercial_id`
- `order_commercial_id`
- `commercial_phone_number_raw`
- `commercial_phone_number_normalized`
- `is_active`
- `created_at`
- `updated_at`

## 5.2. Source de verite par type de donnee

### Source de verite cote plateforme conversationnelle
- statut de conversation
- historique des messages
- notes commerciales
- date de rappel
- intention du client
- qualification du prospect
- portefeuille commercial
- relances
- messages automatiques envoyes

### Source de verite cote plateforme de gestion des commandes
- commande
- montant
- lignes de commande
- mode de paiement
- statut de preparation
- statut de livraison
- annulation de commande
- historique logistique

## 5.3. Synchronisation

Les echanges doivent exister dans deux modes:
- temps reel pour les evenements critiques
- synchronisation differee pour les donnees moins urgentes

Dans le cadre retenu ici:
- le temps reel ou quasi temps reel se fera via webhooks
- une synchronisation differee pourra etre ajoutee plus tard pour controle, rattrapage ou reconciliation

## 5.4. Principes obligatoires pour les webhooks

Comme les echanges seront bases sur des webhooks, il faut prevoir des maintenant les regles suivantes.

### Securite
- signature du webhook
- secret partage
- controle de la source
- eventuellement IPs autorisees

### Fiabilite
- identifiant unique d'evenement
- horodatage d'emission
- gestion de retry
- idempotence
- journalisation des envois

### Observabilite
- statut de livraison du webhook
- historique des echecs
- possibilite de rejouer un evenement
- monitoring sur les dashboards si necessaire

---

## 6. Flux de donnees de la plateforme conversationnelle vers la plateforme de gestion des commandes

Cette section decrit ce que la plateforme conversationnelle doit envoyer.

## 6.1. Creation ou mise a jour d'un prospect ou client

### Quand envoyer
- a la premiere qualification serieuse du prospect
- lorsqu'un dossier client est cree
- lorsqu'une information client importante a change

### Finalite
- permettre a la plateforme de gestion des commandes de reconnaitre le client avant meme la prise de commande

### Donnees a envoyer
- `conversation_client_id`
- `order_client_id` si deja connu
- `client_reference_code` si disponible
- `external_lead_id` si disponible
- `full_name`
- `first_name`
- `last_name`
- `primary_phone`
- `secondary_phone` si disponible
- `additional_phones` si disponibles
- `whatsapp_number` si distinct
- `messenger_id` ou autre identifiant canal si utile
- `city`
- `zone`
- `address` si deja connue
- `source_channel`
- `source_campaign` si disponible
- `source_ad_id` si disponible
- `commercial_id`
- `commercial_phone_number`
- `commercial_name`
- `portfolio_owner_id`
- `client_category_initiale`
- `certification_status`
- `created_at`
- `updated_at`

### Evenements webhook suggeres
- `lead_created`
- `client_updated`

---

## 6.2. Statut metier de fin de conversation

### Quand envoyer
- a la cloture d'une conversation
- apres un appel
- lorsqu'un commercial met a jour le resultat de traitement

### Finalite
- permettre a la plateforme de gestion des commandes de savoir si une commande doit etre attendue ou si un traitement complementaire est necessaire

### Donnees a envoyer
- `conversation_id`
- `conversation_client_id`
- `order_client_id` si connu
- `commercial_id`
- `commercial_phone_number`
- `conversation_status`
- `conversation_result`
- `interested`
- `order_expected`
- `wants_callback`
- `callback_date`
- `callback_time_slot`
- `not_interested_reason`
- `needs_follow_up`
- `follow_up_type`
- `follow_up_due_at`
- `last_contact_at`
- `updated_at`

### Valeurs possibles recommandees pour `conversation_result`
- `commande_confirmee`
- `commande_a_saisir`
- `a_relancer`
- `rappel_programme`
- `pas_interesse`
- `sans_reponse`
- `infos_incompletes`
- `deja_client`
- `annule`

---

## 6.3. Resume commercial de qualification

### Quand envoyer
- quand le commercial a suffisamment qualifie le client
- avant creation de la commande
- apres mise a jour importante

### Finalite
- eviter la ressaisie
- enrichir la plateforme de commande avec le contexte commercial

### Donnees a envoyer
- `conversation_client_id`
- `order_client_id` si connu
- `conversation_id`
- `commercial_id`
- `commercial_phone_number`
- `needs_summary`
- `products_of_interest`
- `desired_quantity`
- `budget_range`
- `preferred_delivery_zone`
- `preferred_contact_time`
- `spoken_language`
- `client_objections`
- `priority_level`
- `client_tags`
- `client_segment`
- `qualification_score` si disponible
- `commentaire_commercial`
- `phones_confirmed_during_exchange` si applicables
- `updated_at`

---

## 6.4. Historique de relance et rappels

### Quand envoyer
- a chaque creation ou mise a jour d'une relance importante

### Finalite
- permettre a la plateforme de gestion des commandes de visualiser le contexte relationnel

### Donnees a envoyer
- `follow_up_id`
- `conversation_client_id`
- `order_client_id` si connu
- `conversation_id`
- `commercial_id`
- `commercial_phone_number`
- `follow_up_type`
- `follow_up_status`
- `scheduled_at`
- `completed_at`
- `result`
- `notes`

---

## 6.5. Historique d'appels commerciaux utiles au traitement de commande

Meme si l'application telephone communique deja avec la plateforme de gestion des commandes, la plateforme conversationnelle peut aussi transmettre des elements de liaison metier.

### Quand envoyer
- apres rattachement d'un appel a une conversation ou a un client

### Finalite
- faire le lien entre l'echange conversationnel et l'activite d'appel

### Donnees a envoyer
- `call_id`
- `conversation_client_id`
- `order_client_id` si connu
- `conversation_id`
- `commercial_id`
- `commercial_phone_number`
- `phone_device_id` si utile
- `call_started_at`
- `call_ended_at`
- `call_duration_sec`
- `call_outcome`
- `call_notes`
- `related_to_order_intent`

---

## 6.6. Categorisation client calculee cote relation commerciale

### Quand envoyer
- lors de tout changement de categorie

### Finalite
- alimenter les tableaux de bord et traitements dans la plateforme de gestion

### Donnees a envoyer
- `conversation_client_id`
- `order_client_id` si connu
- `client_category_code`
- `client_category_label`
- `category_reason`
- `updated_at`

### Categories demandees a ce stade
- client ayant passe commande et jamais livre
- client ayant passe commande et livre au moins une fois
- client venu sans jamais commander
- client ayant passe commande puis annule

Remarque:
- la categorie finale peut etre calculee cote plateforme de gestion des commandes, mais la plateforme conversationnelle doit pouvoir la consommer

---

## 6.7. Historique et execution des messages automatiques

La plateforme conversationnelle gere aussi les messages automatiques envoyes aux clients. Cette information peut etre utile a la plateforme de gestion des commandes pour comprendre le contexte relationnel.

### Quand envoyer
- lors de l'envoi d'un message automatique important
- lors d'un changement de statut d'un scenario automatique
- lors d'un echec d'envoi si cela impacte le suivi commercial

### Finalite
- eviter les relances contradictoires
- permettre a la plateforme de gestion des commandes de connaitre les automatismes deja declenches
- enrichir le dossier relationnel du client

### Donnees a envoyer
- `automation_event_id`
- `conversation_client_id`
- `order_client_id` si connu
- `conversation_id`
- `automation_type`
- `automation_name`
- `trigger_type`
- `message_template_name` si applicable
- `message_content_summary`
- `sent_at`
- `delivery_status`
- `related_to_follow_up`
- `related_to_order`

---

## 7. Flux de donnees de la plateforme de gestion des commandes vers la plateforme conversationnelle

Cette section decrit ce que la plateforme de gestion des commandes doit envoyer en retour.

## 7.1. Creation de commande

### Quand envoyer
- des qu'une commande est creee dans la plateforme de gestion

### Finalite
- permettre a la plateforme conversationnelle de rattacher la commande au client et de mettre a jour le dossier client

### Donnees a envoyer
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `client_reference_code` si disponible
- `matched_phone_number`
- `conversation_id` si connu
- `commercial_id`
- `commercial_phone_number`
- `order_number`
- `order_created_at`
- `order_source`
- `order_status_initial`
- `currency`
- `total_amount`
- `delivery_fee`
- `discount_amount`
- `payment_mode`
- `items_count`
- `items_summary`
- `delivery_address`
- `delivery_city`
- `delivery_zone`
- `expected_delivery_date`

---

## 7.2. Mise a jour du statut de commande

### Quand envoyer
- a chaque changement de statut significatif

### Finalite
- permettre aux commerciaux de savoir ou en est la commande sans quitter la plateforme conversationnelle
- enrichir le dossier client

### Donnees a envoyer
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `previous_status`
- `new_status`
- `status_label`
- `status_updated_at`
- `status_reason` si disponible
- `updated_by`

### Statuts recommandes a transmettre
- `en_attente`
- `confirmee`
- `en_preparation`
- `prete`
- `en_livraison`
- `livree`
- `livraison_echouee`
- `annulee`
- `retournee`

---

## 7.3. Detail de commande utile au commercial

### Quand envoyer
- lors de la creation
- lors d'une modification importante

### Finalite
- afficher dans le dossier client et la conversation le contexte reel de la commande

### Donnees a envoyer
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `items`
  - `product_id`
  - `product_name`
  - `quantity`
  - `unit_price`
  - `line_total`
- `subtotal`
- `discounts`
- `delivery_fee`
- `grand_total`
- `payment_status`

---

## 7.4. Informations de livraison

### Quand envoyer
- quand la livraison est planifiee
- quand elle demarre
- quand elle est terminee
- quand elle echoue

### Finalite
- permettre le suivi client apres-vente
- permettre la bonne categorisation des clients

### Donnees a envoyer
- `delivery_id`
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `delivery_status`
- `delivery_date_planned`
- `delivery_date_actual`
- `delivery_agent_id`
- `delivery_agent_name`
- `delivery_result`
- `delivery_failure_reason`
- `proof_of_delivery_ref` si disponible

---

## 7.5. Annulation de commande

### Quand envoyer
- des qu'une commande est annulee

### Finalite
- mettre a jour le statut commercial du client
- declencher potentiellement une relance ou une action specifique

### Donnees a envoyer
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `cancelled_at`
- `cancelled_by`
- `cancellation_reason`
- `cancellation_category`

---

## 7.6. Agregats client issus du cycle de commande

### Quand envoyer
- en mise a jour reguliere
- ou lors d'evenements majeurs

### Finalite
- enrichir le dossier client sur la plateforme conversationnelle

### Donnees a envoyer
- `conversation_client_id` si connu
- `order_client_id`
- `total_orders_count`
- `total_delivered_orders_count`
- `total_cancelled_orders_count`
- `total_revenue`
- `last_order_date`
- `last_delivery_date`
- `first_order_date`
- `client_order_category`

### Categories metier attendues
- `commande_sans_livraison`
- `commande_avec_livraison`
- `jamais_commande`
- `commande_annulee`

---

## 7.7. Donnees de certification ou validation client

Si la certification client est geree ou consolidee cote plateforme de gestion des commandes, elle doit etre transmise a la plateforme conversationnelle.

### Donnees a envoyer
- `conversation_client_id` si connu
- `order_client_id`
- `certification_status`
- `certification_level`
- `certified_at`
- `certification_reason`
- `verified_phone`
- `verified_identity`
- `risk_flag` si pertinent

---

## 7.8. Donnees de parrainage

Si le programme de parrainage est gere cote gestion des commandes ou marketing, la plateforme conversationnelle doit recevoir:

### Donnees a envoyer
- `referral_id`
- `referrer_client_id`
- `referred_client_id`
- `referral_status`
- `reward_type`
- `reward_value`
- `reward_status`
- `created_at`
- `validated_at`

---

## 8. Donnees que les deux plateformes doivent pouvoir consulter

Certaines donnees doivent etre visibles dans les deux systemes, meme si une seule plateforme en reste maitre.

## 8.1. Fiche client unifiee

Donnees visibles idealement dans les deux plateformes:
- identite client
- telephone principal
- telephones secondaires
- ville
- categorie client
- commercial proprietaire
- statut de certification
- derniere conversation
- derniere commande
- derniere livraison
- prochaine relance

Pour les commerciaux, les deux plateformes devraient aussi pouvoir partager au minimum:
- identite commerciale
- numero de telephone du commercial
- portefeuille ou poste de rattachement si utile

## 8.2. Resume relationnel

Donnees utiles dans les deux plateformes:
- statut de la derniere conversation
- date du dernier appel
- date de la prochaine relance
- nombre de commandes
- nombre de livraisons
- nombre d'annulations
- niveau de priorite du client

---

## 9. Evenements metier a synchroniser en priorite

Voici la liste des evenements minimum a synchroniser entre les deux plateformes.

Comme le mode prevu est le webhook, chaque evenement liste ci-dessous doit etre considere comme un `event_type` de webhook.

## 9.1. De la plateforme conversationnelle vers la plateforme de gestion
- `lead_created`
- `client_updated`
- `conversation_status_changed`
- `conversation_closed`
- `callback_scheduled`
- `follow_up_created`
- `follow_up_completed`
- `call_context_updated`
- `client_category_updated`
- `automation_message_sent`

## 9.2. De la plateforme de gestion des commandes vers la plateforme conversationnelle
- `order_created`
- `order_updated`
- `order_status_changed`
- `delivery_status_changed`
- `order_cancelled`
- `client_order_summary_updated`
- `client_certification_updated`
- `referral_updated`

---

## 10. Contrat minimum de liaison

Pour que tout fonctionne correctement, les deux plateformes doivent au minimum pouvoir se transmettre:
- `conversation_client_id`
- `order_client_id`
- `client_reference_code` si disponible
- `phone_number`
- `phone_number_normalized`
- `phone_number_type` si connu
- `commercial_id`
- `commercial_phone_number`
- `commercial_phone_number_normalized`
- `conversation_id`
- `order_id`
- `event_type`
- `event_timestamp`
- `source_system`

Dans un modele webhook, il est recommande d'ajouter aussi:
- `event_id`
- `event_version`
- `webhook_signature`

Sans cela, la synchronisation sera fragile.

---

## 11. Regles metier importantes

## 11.1. Creation client

Si le client n'existe pas encore dans la plateforme de gestion des commandes:
- la plateforme conversationnelle doit pouvoir l'y creer ou demander sa creation

## 11.2. Creation de commande

Une commande creee dans la plateforme de gestion doit remonter automatiquement dans la plateforme conversationnelle pour:
- enrichir la conversation
- enrichir le dossier client
- mettre a jour les categories du client

## 11.3. Annulation de commande

Une annulation de commande doit remonter immediatement pour:
- reclassement du client
- declenchement eventuel d'une relance
- mise a jour du dossier

## 11.4. Livraison reussie

Une livraison reussie doit:
- mettre a jour le statut client
- alimenter l'historique du dossier
- permettre d'identifier les clients deja livres

## 11.5. Mapping obligatoire avant synchronisation metier complete

Avant de pouvoir faire des echanges avances fiables, les deux plateformes doivent etre capables de rattacher correctement un meme client malgre la difference de types d'identifiants.

Ordre recommande de recherche d'un client correspondant:
1. par telephone normalise
2. par table de mapping `conversation_client_id <-> order_client_id`
3. par numero secondaire deja rattache au client
4. par `client_reference_code`
5. par rapprochement controle manuel si necessaire

Le telephone est donc la base principale de correlation entre les deux plateformes.

## 11.6. Mapping obligatoire des commerciaux

Les deux plateformes doivent aussi etre capables de rattacher correctement un meme commercial malgre la difference de types d'identifiants internes.

Ordre recommande de recherche d'un commercial correspondant:
1. par numero de telephone normalise du commercial
2. par table de mapping `conversation_commercial_id <-> order_commercial_id`
3. par rapprochement controle manuel si necessaire

Le numero de telephone du commercial devient donc la base principale de correlation entre les deux plateformes pour l'identite commerciale.

---

## 12. Donnees a afficher dans la plateforme conversationnelle grace a l'integration

Une fois l'integration en place, la plateforme conversationnelle devrait pouvoir afficher:
- le nombre de commandes du client
- la derniere commande
- le dernier statut de commande
- le statut de livraison
- les annulations passees
- la categorie client
- le niveau de certification
- le statut du parrainage
- les relances en cours

Terminologie a appliquer dans les ecrans et les contrats de donnees:
- preferer `client`
- eviter `customer` dans les schemas techniques d'integration

Cela permettra au commercial d'avoir une vision utile sans changer d'outil.

---

## 13. Donnees a afficher dans la plateforme de gestion des commandes grace a l'integration

La plateforme de gestion des commandes devrait pouvoir afficher:
- le dernier statut de conversation
- le resultat commercial
- les notes commerciales utiles
- la date de rappel prevue
- les preferences client connues
- le commercial proprietaire
- le contexte de qualification

---

## 14. Proposition de structure fonctionnelle des echanges

## 14.1. Bloc identite client
- `client_id`
- `full_name`
- `phones`
  - `phone_number_raw`
  - `phone_number_normalized`
  - `phone_number_type`
  - `is_primary`
- `city`
- `address`
- `certification_status`

## 14.2. Bloc contexte commercial
- `commercial_id`
- `commercial_phone_number`
- `portfolio_owner_id`
- `conversation_status`
- `conversation_result`
- `callback_date`
- `follow_up_status`
- `notes`

## 14.3. Bloc commande
- `order_id`
- `order_status`
- `total_amount`
- `delivery_status`
- `last_order_date`

## 14.4. Bloc categorisation
- `client_category`
- `client_segment`
- `order_behavior_profile`

---

## 15. Recommandation finale

La priorite n'est pas seulement de faire communiquer les deux plateformes.

La priorite est de faire communiquer les bonnes donnees, avec des responsabilites claires.

La logique recommande est:

### La plateforme conversationnelle envoie surtout
- le contexte commercial
- le statut de conversation
- les relances
- la qualification du client
- le rattachement client/commercial
- les messages automatiques envoyes

### La plateforme de gestion des commandes envoie surtout
- les commandes
- les statuts de commande
- les statuts de livraison
- les annulations
- les agregats de comportement client

### Les deux doivent partager
- l'identite client
- les identifiants communs
- les categories client
- les informations de synthese utiles au suivi

Mais comme les identifiants natifs sont differents:
- il faut systematiquement transmettre les deux identifiants quand ils sont connus
- il faut maintenir un mapping fiable entre UUID string et integer

Et comme le canal retenu est le webhook:
- il faut raisonner en evenements metier
- il faut standardiser les noms d'evenements
- il faut rendre chaque webhook idempotent et tracable

---

## 16. Prochaine etape recommandee

Apres validation de ce document, il faudra produire un second document plus technique contenant:
- la liste des API ou webhooks a creer
- le format exact des payloads JSON
- les noms des evenements
- les regles d'erreur et de reprise
- la frequence de synchronisation
- les responsabilites exactes de chaque equipe
- la strategie de mapping entre `conversation_client_id` et `order_client_id`

Comme le choix du webhook est maintenant confirme, le prochain document devra en priorite preciser:
- les webhooks emis par la plateforme conversationnelle
- les webhooks emis par la plateforme de gestion des commandes
- le format standard des payloads
- les regles de securite et de signature
- les regles de retry et d'idempotence
