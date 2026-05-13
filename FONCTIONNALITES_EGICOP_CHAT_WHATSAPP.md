# E-GICOP — Chat WhatsApp Messenger : Fonctionnalités & État d'avancement

> Mis à jour le 2026-05-12

---

## Légende

| Icône | Signification |
|-------|---------------|
| ✅ | Implémenté et fonctionnel |
| ⚠️ | Partiellement implémenté |
| ❌ | Non implémenté |
| 🔒 | Bloqué (dépendance externe) |

---

## Fonctionnalité 1 — Affectation permanente (Sticky Assignment)

> Dès la première soumission du rapport, le client revient toujours sur le même poste.

**Statut global : ✅ COMPLET**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Table d'affinité `contact_assignment_affinity` | ✅ | Migration `ContactAssignmentAffinity1745510400001` — index sur `chat_id` + `poste_id` |
| Résolution du poste par affinité avant la queue pool | ✅ | `AssignConversationUseCase` : vérifie l'affinité active avant `getNextInQueue()` |
| Maintien de l'affinité sur réinjection (reconnexion) | ✅ | `ReinjectConversationUseCase` consulte l'affinité avant de chercher un autre poste |
| Feature flag activable / désactivable | ✅ | `FF_STICKY_ASSIGNMENT` dans `SystemConfigService` |
| Badge "Fidèle" visible pour le commercial | ✅ | `ConversationItem.tsx` — étoile amber si conversation fidèle |
| Logs structurés (AFFINITY_HIT, AFFINITY_FALLBACK…) | ✅ | `gicop-log-events.ts` — 4 constantes de logs |
| Vue admin : taux de saturation + contacts fidèles par poste | ✅ | `CapacityAffinityView.tsx` — `GET /queue/affinity-stats` |

---

## Fonctionnalité 2 — Rapport de conversation

> Pour chaque message entrant, un rapport structuré doit être rempli par le commercial.

**Statut global : ✅ COMPLET**

| Champ du rapport | Statut | Implémentation |
|------------------|--------|----------------|
| Nom et/ou prénoms de la cliente | ✅ | Champ `fullName` (obligatoire) — `GicopReportPanel.tsx` |
| Ville / Commune / Quartier | ✅ | 3 champs séparés : `ville`, `commune`, `quartier` |
| Catégorie de produit (Type de teint ou Forme) | ✅ | `productCategory` — liste déroulante (Teint clair/moyen/foncé, Crème, Sérum, etc.) + saisie libre |
| Autres numéros de téléphone | ✅ | Système multi-téléphones avec libellé — `POST /clients/by-chat/:id/phones` |
| Date et Heure de Relance | ✅ | `followUpAt` — champ `datetime-local` |
| Besoin / ce que la cliente recherche | ✅ | `clientNeed` (obligatoire) — zone de texte |
| Intérêt de la cliente sur 5 | ✅ | `interestScore` (obligatoire) — 5 boutons étoiles avec libellé (Pas intéressée → Passionnée) |
| Homme non intéressé | ✅ | `isMaleNotInterested` — toggle avec note "à rattacher au vrai dossier" |
| Soumission vers plateforme commandes | ✅ | `POST /gicop-report/:chatId/submit` — statut `pending/sent/failed` |
| Auto-retry en cas d'échec de soumission | ✅ | Cron horaire `0 * * * *` dans `ReportSubmissionService` |
| Blocage de clôture si rapport incomplet | ✅ | `FF_GICOP_REPORT_REQUIRED` — bannière front + gateway côté backend |
| Supervision admin (rapports en échec + retry) | ✅ | `GicopSupervisionView.tsx` — `GET /gicop-report/admin/failed-submissions` |
| Historique d'appels visible dans le rapport | ✅ | Section collapsible dans `GicopReportPanel.tsx` |

---

## Fonctionnalité 3 — Limite de conversations simultanées

> Un commercial ne peut pas traiter plus de 10 conversations simultanément.

**Statut global : ✅ COMPLET**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Quota max configurable (`CAPACITY_QUOTA_ACTIVE`) | ✅ | Défaut : 10 — modifiable via `SystemConfigService` |
| Blocage d'assignation si quota atteint | ✅ | `QueueService.getNextInQueue()` filtre les postes pleins |
| Mise en file d'attente si tous les postes sont saturés | ✅ | Log `CAPACITY_ALL_FULL` → conversation passe en `EN_ATTENTE` |
| Badge `#slot` visible dans la liste des conversations | ✅ | `ConversationItem.tsx` — badge bleu avec numéro de slot |
| Méthode utilitaire `hasCapacityForNewConversation()` | ✅ | `ConversationCapacityService` |
| Vue admin : saturation en temps réel par poste | ✅ | `CapacityAffinityView.tsx` |

---

## Fonctionnalité 4 — Obligations d'appels (toutes les 10 conversations)

> Après 10 conversations terminées, chaque commercial doit appeler 15 clientes réparties en 3 catégories (durée min. 1min 30s), et la qualité des 10 derniers messages est vérifiée.

**Statut global : ✅ COMPLET**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Déclenchement automatique toutes les 10 conversations | ✅ | `commercial_obligation_batch` — migration `Sprint6CallObligations1745769600001` |
| 5 appels : commandes annulées (≥ 1min30) | ✅ | `call_task` catégorie `cancelled_order` — `CallObligationService` |
| 5 appels : commandes livrées (≥ 1min30) | ✅ | `call_task` catégorie `delivered_order` |
| 5 appels : venues sans commande (≥ 1min30) | ✅ | `call_task` catégorie `no_order` |
| Vérification durée ≥ 90 secondes | ✅ | `tryMatchCallToTask()` — condition `duration_sec >= 90` |
| Matching appel → tâche par corrélation téléphone | ✅ | `GicopWebhookService` : `call_event` → `tryMatchCallToTask` |
| Contrôle qualité : commercial a la dernière réponse sur 10 msgs | ✅ | `checkAndRecordQuality(posteId)` + `POST /quality-check/:posteId` |
| Barre de progression 3 catégories (front commercial) | ✅ | `ObligationProgressBar.tsx` — polling 60s dans `ConversationList.tsx` |
| Tableau de suivi par poste (admin) | ✅ | `CallObligationsView.tsx` — onglet "Obligations appels" dans `DispatchView.tsx` |

---

## Fonctionnalité 5 — Système de notation client

> À la fin de chaque conversation, un système de notation est envoyé au client pour noter le commercial et sa prestation.

**Statut global : ❌ NON IMPLÉMENTÉ**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Envoi automatique d'un message de notation à la clôture | ❌ | À implémenter |
| Template WhatsApp avec boutons de notation (1 à 5) | ❌ | Nécessite un template HSM validé Meta |
| Stockage de la note reçue | ❌ | Table à créer (ex. `conversation_rating`) |
| Affichage de la note moyenne par commercial (admin) | ❌ | À implémenter |
| Prise en compte de la notation dans les métriques | ❌ | À définir |

---

## Fonctionnalité 6 — Message WhatsApp de rappel 

> Après chaque enregistrement de relance, le système envoie un message WhatsApp au client à la date souhaitée comme rappel de prise de contact.

**Statut global : ⚠️ PARTIEL**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Enregistrement de la relance (`follow_up`) | ✅ | `CreateFollowUpModal.tsx` — bouton "Relance" dans `GicopReportPanel` |
| Détection des relances dues (cron `*/5 * * * *`) | ✅ | `FollowUpReminderService` — filtre `scheduled_at <= now AND reminded_at IS NULL` |
| Notification interne socket au commercial | ✅ | `FollowUpPublisher` — émission `FOLLOW_UP_REMINDER` vers `poste:{id}` |
| Badge rouge sur bouton Relances (front) | ✅ | `UserHeader.tsx` — badge remis à 0 au clic |
| **Envoi d'un message WhatsApp au client à la date de relance** | ❌ | **Pas implémenté** — actuellement seul le commercial est notifié, le client ne reçoit rien |

> **À faire :** Quand `FollowUpReminderService` détecte une relance due, il faut aussi envoyer un message WhatsApp au numéro du client via `OutboundRouterService` (template de confirmation/rappel).

---

## Fonctionnalité 7 — Récapitulatif de commande automatique

> Dès qu'une commande est enregistrée sur une nouvelle conversation (dans les 24h ouvertes), le système envoie un message récapitulatif + photo du produit au client.

**Statut global : 🔒 BLOQUÉ**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Webhook entrant `order_created` depuis l'ERP | 🔒 | Bloqué : contrat de payload ERP non défini (S0-003) |
| Construction du message récapitulatif | ❌ | À implémenter après déblocage |
| Récupération de la photo produit | ❌ | À implémenter après déblocage |
| Envoi du message via `OutboundRouterService` | ❌ | À implémenter après déblocage |
| Vérification que la fenêtre 24h est encore ouverte | ❌ | À implémenter après déblocage |

> **Blocant :** Nécessite que l'équipe ERP/GICOP fournisse le format du webhook `order_created` (S0-003 non levé).

---

## Fonctionnalité 8 — Envoi du code d'expédition

> Dès qu'un code d'expédition est généré, le système l'envoie au numéro WhatsApp du client.

**Statut global : 🔒 BLOQUÉ**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Webhook entrant `shipment_code_created` depuis l'ERP | 🔒 | Bloqué : contrat de payload ERP non défini (S0-003) |
| Résolution du numéro WhatsApp à partir de la commande | ❌ | À implémenter après déblocage |
| Formatage et envoi du message avec le code | ❌ | À implémenter après déblocage |
| Gestion de la fenêtre 24h (template HSM si fermée) | ❌ | À implémenter après déblocage |

> **Blocant :** Même dépendance que la fonctionnalité 7 (S0-003 — contrat ERP).

---

## Fonctionnalité 9 — Catalogue d'informations (bouton envoi)

> Le commercial peut envoyer des catégories d'informations à une cliente via un bouton dédié : utilisation produit, numéro de dépôt,  autres. Chaque entrée peut contenir une image, une vidéo, un document et/ou du texte.

**Statut global : ✅ COMPLET**

| Sous-fonctionnalité | Statut | Détail |
|---------------------|--------|--------|
| Table `information_category_asset` | ✅ | Migration `InformationCategoryAsset1745683200001` |
| CRUD catalogue côté backend | ✅ | `CatalogService` — create/read/update/toggle/delete |
| Bouton "Catalogue" dans le chat commercial | ✅ | `ChatHeader.tsx` — ouvre `CatalogModal.tsx` |
| Filtres par catégorie dans la modale | ✅ | `CatalogModal.tsx` — filtre multi-catégorie |
| Envoi avec texte template personnalisable | ✅ | Sélection → envoi via `POST /messages/media` |
| Support image | ✅ | Type `image` dans `information_category_asset` |
| Support vidéo | ✅ | Type `video` |
| Support document | ✅ | Type `document` |
| Support texte seul | ✅ | Type `text` |
| Catégorie : Utilisation d'un produit/gamme | ✅ | Configurable par l'admin |
| Catégorie : Numéro de téléphone de dépôt | ✅ | Configurable par l'admin |
| Catégorie : Autres | ✅ | Configurable par l'admin |

---

## Résumé global

| # | Fonctionnalité | Statut | Priorité |
|---|----------------|--------|----------|
| 1 | Affectation permanente (sticky assignment) | ✅ Complet | — |
| 2 | Rapport de conversation | ✅ Complet | — |
| 3 | Limite 10 conversations simultanées | ✅ Complet | — |
| 4 | Obligations d'appels (10 conv → 15 appels) | ✅ Complet | — |
| 5 | Notation client à la clôture | ❌ À faire | P1 |
| 6 | Message WhatsApp de rappel relance au client | ⚠️ Partiel | P1 |
| 7 | Récapitulatif commande automatique | 🔒 Bloqué ERP | P0 dès déblocage |
| 8 | Envoi code d'expédition | 🔒 Bloqué ERP | P0 dès déblocage |
| 9 | Catalogue d'informations | ⚠️ Partiel | — |
