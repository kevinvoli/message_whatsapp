# Resume Des Donnees A Echanger Entre La Plateforme Conversationnelle Et La Plateforme De Gestion Des Commandes

Date: 20 avril 2026

## 1. Objet du document

Ce document est un resume concentre uniquement sur les donnees a echanger entre:
- la plateforme conversationnelle
- la plateforme de gestion des commandes

Il ne reprend pas les explications d'architecture en detail. Il sert a garder une vision claire de:
- qui envoie quoi
- dans quel sens
- avec quels identifiants de correlation

Le mode de communication prevu entre les deux plateformes est le `webhook`.

---

## 2. Regles de correlation a retenir

## 2.1. Correlation du client

La correlation entre le client dans les deux plateformes se fait principalement par:
- le numero de telephone du client

Regles importantes:
- le numero doit etre normalise avant comparaison
- un client peut avoir plusieurs numeros
- il faut distinguer:
  - le numero d'origine de la conversation
  - le numero principal
  - les numeros secondaires
  - les numeros ajoutes plus tard

Identifiants utiles:
- `conversation_client_id` : UUID string
- `order_client_id` : integer
- `client_reference_code` si disponible
- `phone_number`
- `phone_number_normalized`
- `phone_number_type`

## 2.2. Correlation du commercial

La correlation entre le commercial dans les deux plateformes se fait principalement par:
- le numero de telephone du commercial

Regles importantes:
- le numero doit etre normalise avant comparaison
- il faut eviter les doublons de commerciaux entre plateformes

Identifiants utiles:
- `conversation_commercial_id`
- `order_commercial_id`
- `commercial_phone_number`
- `commercial_phone_number_normalized`

---

## 3. Donnees minimales communes a transmettre dans presque tous les echanges

Les deux plateformes doivent pouvoir se transmettre au minimum:
- `conversation_client_id`
- `order_client_id`
- `client_reference_code` si disponible
- `phone_number`
- `phone_number_normalized`
- `phone_number_type` si connu
- `conversation_commercial_id` ou `commercial_id` selon le contexte
- `order_commercial_id` si connu
- `commercial_phone_number`
- `commercial_phone_number_normalized`
- `conversation_id`
- `order_id`
- `event_type`
- `event_timestamp`
- `source_system`
- `event_id`
- `event_version`

---

## 4. Donnees envoyees par la plateforme conversationnelle vers la plateforme de gestion des commandes

## 4.1. Creation ou mise a jour d'un prospect ou client

Donnees a envoyer:
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

## 4.2. Statut metier de fin de conversation

Donnees a envoyer:
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

## 4.3. Resume commercial de qualification

Donnees a envoyer:
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

## 4.4. Historique de relance et rappels

Donnees a envoyer:
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

## 4.5. Historique d'appels utiles au traitement commercial

Donnees a envoyer:
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

## 4.6. Categorisation client

Donnees a envoyer:
- `conversation_client_id`
- `order_client_id` si connu
- `client_category_code`
- `client_category_label`
- `category_reason`
- `updated_at`

Categories metier attendues a ce stade:
- client ayant passe commande et jamais livre
- client ayant passe commande et livre au moins une fois
- client venu sans jamais commander
- client ayant passe commande puis annule

## 4.7. Messages automatiques envoyes au client

Donnees a envoyer:
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

## 5. Donnees envoyees par la plateforme de gestion des commandes vers la plateforme conversationnelle

## 5.1. Creation de commande

Donnees a envoyer:
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

## 5.2. Mise a jour du statut de commande

Donnees a envoyer:
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `previous_status`
- `new_status`
- `status_label`
- `status_updated_at`
- `status_reason` si disponible
- `updated_by`

Statuts recommandes:
- `en_attente`
- `confirmee`
- `en_preparation`
- `prete`
- `en_livraison`
- `livree`
- `livraison_echouee`
- `annulee`
- `retournee`

## 5.3. Detail de commande

Donnees a envoyer:
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

## 5.4. Informations de livraison

Donnees a envoyer:
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

## 5.5. Annulation de commande

Donnees a envoyer:
- `order_id`
- `conversation_client_id` si connu
- `order_client_id`
- `cancelled_at`
- `cancelled_by`
- `cancellation_reason`
- `cancellation_category`

## 5.6. Agregats client issus des commandes

Donnees a envoyer:
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

## 5.7. Certification ou validation client

Donnees a envoyer:
- `conversation_client_id` si connu
- `order_client_id`
- `certification_status`
- `certification_level`
- `certified_at`
- `certification_reason`
- `verified_phone`
- `verified_identity`
- `risk_flag` si pertinent

## 5.8. Donnees de parrainage

Donnees a envoyer:
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

## 6. Donnees que les deux plateformes doivent pouvoir afficher ou consulter

## 6.1. Fiche client unifiee

Donnees utiles dans les deux plateformes:
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

## 6.2. Resume relationnel

Donnees utiles dans les deux plateformes:
- statut de la derniere conversation
- date du dernier appel
- date de la prochaine relance
- nombre de commandes
- nombre de livraisons
- nombre d'annulations
- niveau de priorite du client

## 6.3. Donnees minimales sur le commercial

Donnees utiles dans les deux plateformes:
- identite commerciale
- numero de telephone du commercial
- portefeuille ou poste de rattachement si utile

---

## 7. Liste courte des evenements webhook a prevoir

## 7.1. Webhooks emis par la plateforme conversationnelle
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

## 7.2. Webhooks emis par la plateforme de gestion des commandes
- `order_created`
- `order_updated`
- `order_status_changed`
- `delivery_status_changed`
- `order_cancelled`
- `client_order_summary_updated`
- `client_certification_updated`
- `referral_updated`

---

## 8. Resume final

### La plateforme conversationnelle doit surtout envoyer:
- les informations client de qualification
- le statut de conversation
- les relances
- les rappels
- les appels rattaches au contexte commercial
- les categories client
- les messages automatiques

### La plateforme de gestion des commandes doit surtout envoyer:
- la creation de commande
- les statuts de commande
- les details de commande
- les informations de livraison
- les annulations
- les agregats client issus du cycle de commande
- la certification client
- les donnees de parrainage

### Les deux plateformes doivent partager en permanence:
- la correlation client par numero de telephone
- la correlation commercial par numero de telephone
- les identifiants de liaison
- les informations de synthese utiles au suivi

