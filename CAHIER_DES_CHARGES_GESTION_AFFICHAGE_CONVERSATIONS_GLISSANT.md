# Cahier des charges - Gestion glissante de l'affichage des conversations commerciaux

Date : 21 avril 2026

## 1. Objet du document

Ce document définit le cahier des charges d'implémentation d'une nouvelle fonctionnalité de contrôle d'affichage des conversations pour les commerciaux.

L'objectif est de remplacer le fonctionnement actuel basé sur une liste plus libre et sur du scroll/paging, par un système strict de capacité contrôlée, avec :

- un maximum absolu de 50 conversations visibles par commercial
- 10 conversations actives et exploitables
- 40 conversations visibles mais verrouillées
- une logique glissante par blocs de 10
- un déverrouillage conditionné par la validation de critères métier
- une dépendance à des données externes provenant de la plateforme de gestion des commandes et du suivi des appels

## 2. Documents de référence

Ce cahier des charges s'appuie sur les documents suivants :

- [BILAN_REUNION_APPLICATION_SUIVI_CLIENT.md](C:/Users/gbamb/Desktop/projet/whatsapp/BILAN_REUNION_APPLICATION_SUIVI_CLIENT.md)
- [PLAN_IMPLEMENTATION_FONCTIONNALITES_REUNION_PLATEFORME_CONVERSATIONNELLE.md](C:/Users/gbamb/Desktop/projet/whatsapp/PLAN_IMPLEMENTATION_FONCTIONNALITES_REUNION_PLATEFORME_CONVERSATIONNELLE.md)
- [SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md](C:/Users/gbamb/Desktop/projet/whatsapp/SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md)
- [RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md)
- [SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md)

## 3. Contexte métier

L'entreprise souhaite contraindre davantage le travail des commerciaux afin de :

- limiter la surcharge
- imposer une discipline de traitement
- éviter qu'un commercial accumule trop de conversations non qualifiées
- s'assurer qu'une conversation ne donne accès à la suivante qu'après validation d'étapes métier précises

Cette logique s'inscrit dans la volonté déjà exprimée lors des réunions :

- limiter le nombre de conversations par commercial
- forcer la validation de critères avant de voir d'autres conversations
- restreindre le nombre de conversations réellement actives à la fois
- mieux relier le travail conversationnel au travail d'appel et à la gestion de commande

## 4. Etat actuel observé dans le code

L'analyse du code montre qu'une base partielle existe déjà.

### 4.1 Backend

Le backend contient déjà :

- un quota de capacité avec `quotaActive = 10` et `quotaTotal = 50`
- un champ `is_locked` sur `whatsapp_chat`
- un service `ConversationCapacityService`
- un masquage des conversations verrouillées dans le mapper socket

Fonctionnement actuel observé :

- si le quota actif est dépassé, les conversations supplémentaires sont marquées `is_locked = true`
- lorsqu'une conversation est qualifiée, une seule conversation verrouillée est déverrouillée
- la liste conversationnelle est encore servie via pagination keyset

### 4.2 Frontend

Le `front` contient déjà :

- une liste de conversations avec scroll vertical
- un mécanisme de chargement supplémentaire via sentinel et `IntersectionObserver`
- un affichage grisé des conversations verrouillées
- un masquage partiel du nom, du numéro et du dernier message

### 4.3 Limites de l'existant

L'existant ne répond pas encore au besoin métier demandé car :

- le scroll infini / chargement incrémental existe encore
- le système déverrouille une conversation à la fois et non un bloc de 10
- il n'existe pas encore de vraie fenêtre glissante 10 + 40
- il n'existe pas encore de moteur de critères de validation externes
- l'animation de sortie des 10 conversations traitées n'existe pas

## 5. Vision cible de la fonctionnalité

Le comportement cible doit être le suivant.

### 5.1 Fenêtre fixe de 50 conversations

A tout instant, un commercial ne doit jamais voir plus de 50 conversations dans sa plateforme.

Cette fenêtre de 50 conversations doit être composée de :

- 10 conversations actives
- 40 conversations verrouillées

### 5.2 Conversations actives

Les 10 conversations actives sont les seules conversations pour lesquelles le commercial peut :

- ouvrir la conversation
- voir les messages
- voir le numéro du client
- voir les détails du client
- répondre
- interagir normalement

### 5.3 Conversations verrouillées

Les 40 conversations verrouillées restent visibles dans la liste mais sous une forme dégradée.

Pour ces conversations verrouillées :

- le commercial ne peut pas les ouvrir
- le commercial ne peut pas voir les messages
- le commercial ne peut pas voir le numéro du client
- le commercial ne peut pas voir les détails sensibles
- la carte conversation doit être grisée ou verrouillée

### 5.4 Logique glissante

Quand les 10 conversations actives ont été validées selon les critères métiers définis :

- les 10 conversations actives quittent la fenêtre visible
- elles disparaissent avec un effet visuel de glissement vers le haut
- les 10 premières conversations parmi les 40 verrouillées deviennent actives
- 10 nouvelles conversations provenant du poste sont injectées en fin de fenêtre
- la fenêtre revient à l'état cible : 10 actives + 40 verrouillées

Autrement dit :

- la fenêtre ne grandit jamais
- elle se renouvelle par blocs de 10
- le renouvellement est conditionné par la validation métier

## 6. Règles métier obligatoires

## 6.1 Suppression du scroll infini

Le scroll infini doit être supprimé pour la liste principale des conversations commerciales.

Conséquences :

- plus de chargement automatique par sentinel
- plus de pagination destinée à charger toujours plus de conversations visibles
- la liste commerciale doit être bornée à 50 éléments maximum

Note :

- un scroll visuel interne peut subsister si nécessaire pour naviguer dans les 50 éléments
- mais il ne doit jamais charger une 51e conversation visible côté commercial

## 6.2 Fenêtre maximale fixe

En toute circonstance, le commercial ne doit pas dépasser 50 conversations visibles.

Cela vaut :

- à la connexion
- après réception de nouveaux messages
- après qualification
- après déverrouillage
- après réinjection

## 6.3 Rotation par bloc de 10

Le déverrouillage ne doit pas être géré conversation par conversation dans la logique cible.

La logique cible doit fonctionner par lot :

- 10 conversations actives sortent
- 10 conversations verrouillées montent
- 10 nouvelles conversations entrent en bas

## 6.4 Validation avant progression

Le commercial ne peut accéder au bloc suivant que si les 10 conversations actives remplissent les critères attendus.

Le système doit donc empêcher :

- qu'une conversation soit simplement laissée ouverte
- qu'un commercial saute des étapes
- qu'un bloc suivant soit débloqué sans validation métier

## 7. Critères de validation métier

## 7.1 Principe général

Le déverrouillage d'un nouveau bloc de conversations dépend de critères externes et internes.

Le système doit être conçu pour supporter plusieurs critères, présents et futurs.

## 7.2 Critères déjà explicitement donnés

Le premier critère métier explicitement demandé est la confirmation d'appel provenant de la plateforme de gestion des commandes.

Les informations attendues sont :

- le numéro appelé par le commercial
- le statut de l'appel
- le lien de l'enregistrement audio

Ces informations doivent servir à prouver qu'une action d'appel a réellement eu lieu.

## 7.3 Nature des critères

Les critères doivent être modélisés comme des règles configurables et cumulables.

Exemples de critères à supporter :

- appel passé confirmé par la plateforme externe
- statut d'appel renseigné
- résultat conversationnel renseigné
- relance planifiée
- note obligatoire renseignée
- pièce externe reçue
- commande créée ou non créée

## 7.4 Validation de bloc

Le système doit définir clairement comment un bloc de 10 conversations est considéré comme validé.

Règle recommandée pour l'implémentation :

- un bloc est validé si chacune des 10 conversations actives atteint un état métier conforme
- la conformité est évaluée par un moteur de critères

Il ne faut pas se limiter au simple champ `conversation_result`.

## 8. Sources de vérité

Conformément au document [SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md), les validations externes ne doivent pas être simulées localement comme si elles étaient la vérité.

### 8.1 Source de vérité appel

La confirmation qu'un appel a été réellement passé doit venir de la plateforme externe déjà connectée au système de prise de commande / application téléphone entreprise.

La plateforme conversationnelle peut :

- recevoir
- stocker
- exploiter
- afficher

Mais elle ne doit pas inventer la preuve de l'appel.

### 8.2 Corrélation

La corrélation doit rester cohérente avec les règles déjà définies dans les documents précédents :

- corrélation client par numéro de téléphone
- corrélation commercial par numéro de téléphone

## 9. Modèle fonctionnel cible

## 9.1 Concepts à introduire

Pour rendre la fonctionnalité robuste, il est recommandé d'introduire les concepts suivants.

### A. Fenêtre d'affichage commerciale

Représente les 50 conversations visibles à un instant donné pour un poste.

### B. Slot de fenêtre

Position ordonnée de 1 à 50.

### C. Groupe actif

Sous-ensemble des slots 1 à 10, actuellement exploitables.

### D. Groupe verrouillé

Sous-ensemble des slots 11 à 50, visibles mais non consultables.

### E. Cycle de fenêtre

Une itération complète avant rotation.

### F. Etat de validation conversationnelle

Etat calculé à partir des critères atteints ou manquants.

## 9.2 Etats recommandés pour une conversation dans la fenêtre

Une conversation visible dans la fenêtre devrait avoir au moins les états suivants :

- `active`
- `locked`
- `validated`
- `released`
- `replaced`

Le champ actuel `is_locked` ne suffit probablement pas à exprimer toute la logique cible.

## 10. Exigences fonctionnelles détaillées

## 10.1 Chargement initial

A la connexion du commercial :

- le système doit charger au maximum 50 conversations
- les 10 premières doivent être actives
- les 40 suivantes doivent être verrouillées
- l'ordre doit être stable et défini par la politique métier

## 10.2 Ouverture de conversation

Le système doit empêcher l'ouverture d'une conversation verrouillée.

Il doit aussi empêcher l'accès aux informations masquées :

- numéro du client
- message
- détails sensibles

## 10.3 Validation d'une conversation active

Une conversation active doit pouvoir avancer vers un état validé lorsque les critères requis sont atteints.

L'interface doit afficher clairement :

- les critères déjà validés
- les critères manquants
- l'état global de la conversation

## 10.4 Validation du bloc de 10

Quand les 10 conversations actives sont toutes validées :

- le système déclenche la rotation du bloc
- les 10 conversations quittent la fenêtre active
- les 10 suivantes sont promues
- 10 nouvelles conversations sont ajoutées en bas

## 10.5 Animation de glissement

Le `front` doit produire une animation lisible et contrôlée :

- les 10 conversations sorties disparaissent avec un mouvement vers le haut
- les 10 suivantes prennent leur place
- la transition ne doit pas casser la sélection ni provoquer de re-render brutal

L'animation doit être purement visuelle. La vérité fonctionnelle reste backend.

## 10.6 Mise à jour temps réel

Les changements d'état doivent être poussés en temps réel au poste :

- verrouillage
- déverrouillage
- validation d'un critère
- rotation de bloc
- entrée de nouvelles conversations

## 11. Données à échanger avec la plateforme externe

## 11.1 Mécanisme d'intégration

La communication doit suivre le principe déjà retenu dans les documents précédents :

- échange par webhook

## 11.2 Données minimales attendues pour le critère appel

Le webhook externe doit pouvoir transmettre au minimum :

- identifiant externe de l'événement
- date de l'événement
- numéro du commercial
- numéro appelé
- statut de l'appel
- durée éventuelle
- lien de l'enregistrement audio
- identifiant de la commande si disponible

## 11.3 Usage de ces données

Ces données doivent servir à :

- corréler l'appel à la bonne conversation
- mettre à jour les critères de validation
- afficher la preuve métier
- débloquer ou non la progression du bloc

## 11.4 Statuts d'appel à prévoir

Le système doit prévoir une table de correspondance entre les statuts externes et les statuts internes.

Exemples possibles :

- appel abouti
- pas de réponse
- occupé
- rejeté
- échec technique
- messagerie

## 12. Exigences backend

## 12.1 Refonte de la logique capacité

Le service de capacité actuel devra évoluer.

Constat :

- l'existant gère déjà `quotaActive = 10` et `quotaTotal = 50`
- l'existant déverrouille une conversation à la fois

Nouvelle exigence :

- gérer des promotions par lot de 10
- gérer une vraie fenêtre glissante stable
- gérer les critères de validation multi-sources

## 12.2 Nouveau moteur de validation

Il faut introduire un moteur de validation conversationnelle capable de :

- enregistrer les critères attendus
- enregistrer les critères atteints
- recalculer l'état d'une conversation
- recalculer l'état du bloc de 10
- décider du déclenchement de la rotation

## 12.3 Nouveau moteur de rotation

Il faut introduire un service dédié de rotation de fenêtre qui :

- retire les 10 conversations validées
- promeut les 10 premières verrouillées
- injecte 10 nouvelles conversations
- republie l'état de la fenêtre au poste

## 12.4 API et événements temps réel

Le backend doit fournir :

- l'état complet de la fenêtre de 50
- les métadonnées de verrouillage
- les critères de validation
- l'avancement du bloc
- les événements de rotation

## 12.5 Persistance recommandée

L'implémentation ne doit pas reposer uniquement sur `is_locked`.

Il est recommandé d'ajouter des structures persistées pour :

- l'ordre de fenêtre
- la position dans la fenêtre
- l'état de validation
- les preuves externes reçues
- l'appartenance au cycle courant

## 13. Exigences frontend

## 13.1 Suppression du scroll infini

Le composant de liste conversationnelle doit être modifié pour :

- supprimer `loadMoreConversations`
- supprimer le sentinel `IntersectionObserver`
- n'afficher que les 50 conversations fournies par le backend

## 13.2 Rendu différencié

Le `front` doit différencier clairement :

- conversation active
- conversation verrouillée
- conversation validée en attente de rotation

## 13.3 Masquage renforcé

Pour les conversations verrouillées, le `front` doit masquer :

- le numéro du client
- le contenu des messages
- les détails de contact

Le backend doit également continuer à masquer les données dans les payloads.

## 13.4 Barre de progression du bloc

L'interface doit afficher une information du type :

- `Bloc en cours : 7 / 10 conversations validées`

Cela permet au commercial de comprendre pourquoi le bloc suivant n'est pas encore débloqué.

## 13.5 Animation de rotation

L'animation doit :

- être déclenchée sur instruction ou changement d'état confirmé par le backend
- être fluide
- ne pas réordonner de façon incohérente les éléments

## 14. Exigences d'administration

Cette fonctionnalité doit être paramétrable côté admin.

Paramètres minimums à prévoir :

- taille de la fenêtre totale
- taille du bloc actif
- activation ou non du mode glissant
- liste des critères obligatoires
- ordre de priorité des critères
- seuil de validation du bloc
- comportement en cas d'absence de réponse externe

## 15. Exigences de sécurité et robustesse

## 15.1 Sécurité métier

Le système doit empêcher qu'un commercial contourne la restriction par :

- manipulation du frontend seul
- sélection manuelle d'une conversation verrouillée
- conservation d'un ancien état local

La vérité doit être portée par le backend.

## 15.2 Idempotence des webhooks

Les validations externes reçues par webhook doivent être idempotentes.

Le système doit éviter :

- les doublons de validation
- les promotions multiples du même bloc
- les rotations déclenchées plusieurs fois

## 15.3 Reconnexion

Après déconnexion / reconnexion :

- le commercial doit retrouver exactement sa fenêtre actuelle
- la position et les états doivent être cohérents

## 16. Cas limites à traiter

Le système doit définir le comportement pour les cas suivants :

- moins de 50 conversations disponibles
- moins de 10 conversations actives possibles
- critère externe reçu en retard
- webhook externe absent
- conversation supprimée en cours de cycle
- conversation transférée
- conversation fusionnée
- commercial déconnecté pendant une rotation
- ordre de la fenêtre déjà partiellement consommé

## 17. Phasage recommandé

## Phase 1 : cadrage technique

- formaliser le modèle de fenêtre
- définir le modèle de validation
- définir le contrat webhook externe

## Phase 2 : backend fondation

- moteur de validation
- moteur de rotation
- persistance de la fenêtre
- publication temps réel

## Phase 3 : frontend

- suppression du scroll infini
- rendu 10 + 40
- affichage des critères
- animation de glissement

## Phase 4 : intégration externe

- réception webhook appels
- corrélation conversation
- prise en compte dans la validation

## Phase 5 : robustesse

- gestion des cas limites
- tests de charge et de concurrence
- tests de reconnexion

## 18. Critères d'acceptation

La fonctionnalité sera considérée conforme si :

- le commercial ne voit jamais plus de 50 conversations
- seules 10 conversations sont réellement exploitables à un instant donné
- les 40 autres sont visibles mais verrouillées
- le scroll infini a disparu
- le bloc suivant ne se déverrouille qu'après validation métier
- la preuve d'appel externe peut participer à la validation
- la rotation se fait par lot de 10
- l'animation de glissement est présente et cohérente
- le backend reste la source de vérité des états

## 19. Recommandation d'architecture

Au vu du code existant, la meilleure approche n'est pas de patcher uniquement le `front`.

Il faut mettre en place une vraie logique serveur avec :

- une fenêtre métier persistée ou recalculable de façon déterministe
- un moteur de validation conversationnelle
- un moteur de rotation par bloc
- un payload socket spécialisé pour la fenêtre commerciale

L'existant `is_locked + quota 10/50` peut servir de base, mais il doit être étendu. En particulier :

- le déverrouillage unitaire doit être remplacé par une promotion groupée
- la pagination de type `loadMoreConversations` doit être abandonnée pour cette vue
- les événements externes de validation doivent devenir des déclencheurs de progression

## 20. Conclusion

Cette fonctionnalité ne doit pas être considérée comme un simple changement d'interface. Il s'agit d'une règle métier structurante sur la manière dont un commercial consomme son portefeuille de conversations.

La réussite de l'implémentation dépendra de trois éléments :

- une vérité backend forte sur la fenêtre 10 + 40
- une bonne intégration des preuves externes de validation
- une interface claire qui rend visible la progression du bloc et la logique de déverrouillage

Ce cahier des charges sert de base pour découper ensuite l'implémentation en tickets backend, frontend, base de données, intégration webhook et QA.
