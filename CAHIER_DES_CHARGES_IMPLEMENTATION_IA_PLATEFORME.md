# Cahier des charges d'implémentation de l'IA dans la plateforme

Date : 21 avril 2026

## 1. Objet du document

Ce cahier des charges définit le cadre d'implémentation de l'intelligence artificielle dans la plateforme conversationnelle et ses interfaces d'administration.

Il a pour objectif de transformer les orientations déjà définies dans les précédents documents en un cadre de réalisation exploitable par les équipes :

- produit
- technique
- frontend
- backend
- QA
- exploitation

Ce document couvre :

- le périmètre fonctionnel IA
- les principes de gouvernance
- les exigences fonctionnelles
- les exigences techniques
- les exigences de sécurité
- les exigences d'administration
- les phases d'implémentation
- les livrables attendus

## 2. Documents de référence

Le présent cahier des charges s'appuie sur les documents suivants :

- [RAPPORT_UTILISATION_IA_PLATEFORME_2026-04-21.md](C:/Users/gbamb/Desktop/projet/whatsapp/RAPPORT_UTILISATION_IA_PLATEFORME_2026-04-21.md)
- [GOUVERNANCE_IA_ADMIN_PLATEFORME.md](C:/Users/gbamb/Desktop/projet/whatsapp/GOUVERNANCE_IA_ADMIN_PLATEFORME.md)
- [SPEC_ECRANS_ADMIN_GOUVERNANCE_IA.md](C:/Users/gbamb/Desktop/projet/whatsapp/SPEC_ECRANS_ADMIN_GOUVERNANCE_IA.md)
- [PLAN_IMPLEMENTATION_FONCTIONNALITES_REUNION_PLATEFORME_CONVERSATIONNELLE.md](C:/Users/gbamb/Desktop/projet/whatsapp/PLAN_IMPLEMENTATION_FONCTIONNALITES_REUNION_PLATEFORME_CONVERSATIONNELLE.md)
- [BILAN_REUNION_APPLICATION_SUIVI_CLIENT.md](C:/Users/gbamb/Desktop/projet/whatsapp/BILAN_REUNION_APPLICATION_SUIVI_CLIENT.md)
- [SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md](C:/Users/gbamb/Desktop/projet/whatsapp/SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md)
- [RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md)
- [SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md)

## 3. Contexte

L'entreprise exploite une activité de vente en ligne alimentée par des campagnes publicitaires sur plusieurs canaux, notamment :

- WhatsApp
- Messenger
- autres canaux de messagerie

Le flux métier actuel est le suivant :

- les prospects arrivent sur la plateforme conversationnelle
- les commerciaux échangent avec eux par messagerie
- les commerciaux utilisent ensuite les téléphones de l'entreprise pour appeler
- les commandes sont saisies dans une plateforme distincte de gestion de commande
- d'autres applications existent déjà pour les livreurs, le stock et le suivi opérationnel

Le besoin principal exprimé lors des réunions est d'aller vers un suivi client beaucoup plus complet, proche d'une logique de dossier client structuré, avec un meilleur encadrement du travail commercial, des relances, de la qualification et du pilotage.

Dans ce contexte, l'IA ne doit pas être un simple gadget conversationnel. Elle doit devenir un outil de :

- structuration
- qualification
- assistance commerciale
- relance
- synthèse
- supervision
- pilotage administrable

## 4. Vision cible

La vision cible de l'IA dans la plateforme est la suivante :

- assister les commerciaux sans les remplacer
- structurer automatiquement les conversations en données métier exploitables
- alimenter le dossier client
- améliorer la qualité et la cohérence des échanges
- accélérer la reprise de contexte
- améliorer la qualification des conversations
- renforcer les relances
- fournir un cadre d'automatisation sécurisé
- rester entièrement gouvernable depuis l'admin

Le principe directeur est :

- l'IA doit être utile
- l'IA doit être contrôlée
- l'IA doit être traçable
- l'IA doit être optionnelle

## 5. Périmètre du cahier des charges

## 5.1 Périmètre inclus

Le périmètre inclus couvre :

- l'assistance IA dans la plateforme conversationnelle
- l'administration des usages IA
- la gestion des messages générés par IA dans les FlowBots
- la qualification assistée des conversations
- les résumés IA de conversation
- la correction et la réécriture de texte
- les suggestions de réponses pour les commerciaux
- la relance assistée par IA
- la synthèse IA orientée dossier client
- l'audit, la traçabilité, les coûts et les performances

## 5.2 Périmètre exclu

Le périmètre exclut à ce stade :

- la certification automatique définitive des clients
- la prise de décision métier irréversible sans validation humaine
- la notation disciplinaire automatique des commerciaux
- la modification automatique des sources de vérité externes sans contrôle
- le remplacement de la plateforme de gestion des commandes

## 6. Principes directeurs obligatoires

Les principes suivants sont obligatoires pour toute implémentation.

### Principe 1 : chaque usage IA doit être optionnel

Aucun module IA ne doit être imposé globalement.

Chaque usage doit être :

- activable
- désactivable
- suspendable
- configurable indépendamment

### Principe 2 : la gouvernance doit passer par l'interface admin

L'admin doit pouvoir décider :

- quels modules utilisent l'IA
- sur quels canaux
- dans quels scénarios
- avec quelles contraintes
- avec quel niveau de validation

### Principe 3 : l'IA ne doit jamais devenir source de vérité métier

L'IA peut :

- proposer
- résumer
- suggérer
- qualifier
- aider à décider

L'IA ne doit pas :

- remplacer les sources de vérité
- créer seule une vérité métier définitive
- engager seule une action sensible non validée

### Principe 4 : les usages sensibles doivent être encadrés

Les usages sensibles doivent comporter :

- des interdictions explicites
- des garde-fous
- un fallback
- une validation humaine si nécessaire

### Principe 5 : toute exécution IA importante doit être traçable

Il faut journaliser :

- qui a déclenché
- dans quel module
- sur quel scénario
- avec quel résultat
- avec ou sans fallback
- avec ou sans validation humaine

## 7. Modules IA à implémenter

## 7.1 Module de suggestions de réponses

Objectif :

- assister le commercial dans la rédaction rapide de réponses adaptées

Fonctions attendues :

- proposer plusieurs réponses courtes
- tenir compte du contexte conversationnel
- orienter les suggestions selon l'étape commerciale
- permettre une validation manuelle par le commercial

Contraintes :

- aucune suggestion ne doit être envoyée automatiquement
- l'admin doit pouvoir activer ou désactiver ce module

## 7.2 Module de correction et réécriture

Objectif :

- améliorer la qualité rédactionnelle des messages envoyés par les commerciaux

Fonctions attendues :

- correction
- amélioration
- formalisation
- raccourcissement

Contraintes :

- l'IA ne doit jamais envoyer elle-même le texte réécrit
- l'utilisateur doit toujours valider la version finale

## 7.3 Module de résumé IA de conversation

Objectif :

- produire une synthèse rapide et structurée d'une conversation

Fonctions attendues :

- résumé général
- points clés
- sentiment global
- actions suggérées

Contraintes :

- le résumé peut être affiché ou enregistré selon le paramétrage admin
- les données sensibles doivent respecter la politique de masquage

## 7.4 Module de qualification assistée

Objectif :

- transformer le contenu conversationnel en données métier structurées

Sorties attendues :

- statut proposé
- résultat proposé
- besoin de relance
- date de relance suggérée
- niveau d'intérêt
- objection principale
- produits mentionnés

Contraintes :

- la qualification doit rester validable par l'humain
- l'IA ne doit pas clôturer seule une conversation critique

## 7.5 Module IA pour FlowBot

Objectif :

- autoriser certains messages FlowBot à être générés par IA dans un cadre strict

Fonctions attendues :

- activer ou non l'IA pour un flow
- activer ou non l'IA pour un nœud précis
- définir le contexte métier
- définir le ton
- définir les interdictions
- définir un fallback

Contraintes :

- un nœud IA sans cadre complet ne doit pas être publiable
- un nœud automatique doit disposer d'une stratégie de fallback

## 7.6 Module de relance assistée

Objectif :

- améliorer les relances clients selon l'historique et le contexte métier

Fonctions attendues :

- proposer ou générer des messages de relance
- distinguer plusieurs scénarios de relance
- respecter les contraintes de fréquence
- respecter les catégories de clients

Contraintes :

- chaque scénario doit être paramétrable séparément
- les cas sensibles doivent pouvoir exiger validation humaine

## 7.7 Module de synthèse dossier client

Objectif :

- produire une vue synthétique utile pour le suivi client long terme

Fonctions attendues :

- résumé du parcours conversationnel
- résumé des interactions passées
- signaux utiles pour la prochaine action
- mise en évidence des risques ou incohérences

Contraintes :

- la synthèse n'est qu'une couche de lecture
- elle ne remplace jamais les données sources

## 7.8 Module d'analyse qualité / coaching

Objectif :

- aider les superviseurs à comprendre la qualité opérationnelle des échanges

Fonctions attendues :

- détection de conversations faibles ou incomplètes
- indicateurs de qualité
- aide au coaching
- explication des points d'amélioration

Contraintes :

- ne pas produire de score opaque utilisé comme sanction automatique
- toujours rendre les critères explicables

## 8. Exigences fonctionnelles détaillées

## 8.1 Administration

Le système doit permettre à l'admin de :

- activer ou désactiver chaque module IA
- configurer le fournisseur IA
- configurer les modèles
- définir des paramètres par module
- définir des paramètres par scénario
- définir des paramètres par message pour les usages FlowBot
- imposer des validations humaines
- consulter les journaux d'utilisation
- consulter les coûts et performances

## 8.2 Paramétrage par module

Chaque module doit disposer au minimum des paramètres suivants :

- statut
- rôles autorisés
- canaux autorisés
- horaires autorisés
- validation requise
- fallback
- règles de sécurité

## 8.3 Paramétrage par scénario

Chaque scénario IA doit pouvoir définir :

- le contexte
- l'objectif
- le ton
- le niveau de formalité
- la longueur maximale
- les éléments obligatoires
- les éléments interdits
- la stratégie de fallback
- le mode test ou production

## 8.4 Paramétrage des messages FlowBot générés par IA

Pour chaque message généré par IA, il doit être possible de définir :

- contexte du message
- objectif métier
- ton
- style
- contraintes
- interdictions
- texte fallback
- niveau de validation humaine

## 8.5 Journalisation et audit

Le système doit journaliser au minimum :

- date de l'exécution
- module
- scénario
- acteur déclencheur
- canal
- succès ou échec
- latence
- fallback utilisé ou non
- validation humaine utilisée ou non

## 8.6 Dashboard admin IA

Le système doit fournir un tableau de bord permettant de visualiser :

- modules actifs
- scénarios actifs
- volume d'usage
- taux d'erreur
- taux de fallback
- coût estimé
- temps moyen de réponse
- incidents récents

## 9. Exigences techniques

## 9.1 Architecture backend

Le backend doit permettre :

- une abstraction du fournisseur IA
- la configuration dynamique des modules
- des règles de sécurité centralisées
- la journalisation des exécutions
- une séparation claire entre configuration globale, configuration module et configuration scénario

## 9.2 Architecture frontend admin

L'admin doit intégrer les écrans décrits dans :

- [SPEC_ECRANS_ADMIN_GOUVERNANCE_IA.md](C:/Users/gbamb/Desktop/projet/whatsapp/SPEC_ECRANS_ADMIN_GOUVERNANCE_IA.md)

Le frontend admin doit permettre :

- une navigation dédiée IA
- la consultation et l'édition des configurations
- la validation des champs obligatoires
- la prévisualisation des scénarios sensibles

## 9.3 Architecture frontend commerciaux

Le `front` doit intégrer ou maintenir :

- suggestions IA
- réécriture
- résumé conversation
- éventuels flux de validation humaine

Les usages IA visibles dans le `front` doivent respecter les droits et règles définis dans l'admin.

## 9.4 Configuration des fournisseurs

Le système doit pouvoir gérer :

- fournisseur
- modèle
- URL API
- clé API
- timeout
- règles de retry

La configuration d'un fournisseur ne doit pas activer automatiquement les usages métier.

## 9.5 Persistance

Le système doit prévoir la persistance des éléments suivants :

- configuration globale IA
- configuration par module
- configuration par scénario
- contraintes réutilisables
- historiques d'exécution
- éventuels états de validation

## 9.6 Performance

Les usages IA doivent être conçus pour limiter l'impact sur l'expérience utilisateur.

Les traitements doivent pouvoir être :

- synchrones pour les besoins immédiats
- asynchrones pour les traitements de fond

Exemples de traitements potentiellement asynchrones :

- synthèses enrichies
- analyses qualité
- résumés de portefeuille
- relances batch

## 10. Exigences de sécurité et conformité

## 10.1 Masquage des données sensibles

Le système doit permettre de masquer selon la politique admin :

- numéros de téléphone
- noms
- adresses
- autres données sensibles

## 10.2 Blocages métier obligatoires

Le système doit pouvoir empêcher l'IA de :

- promettre une livraison non confirmée
- promettre un stock non confirmé
- promettre un prix non validé
- contourner les sources de vérité
- insister de manière agressive après refus explicite

## 10.3 Validation humaine

Les usages suivants doivent pouvoir être configurés avec validation humaine obligatoire :

- relances sensibles
- messages automatiques sensibles
- qualification critique
- actions sur clients à risque

## 10.4 Audit

Toute décision sensible impliquant l'IA doit pouvoir être auditée.

## 11. Sources de vérité et intégration inter-plateformes

L'implémentation IA doit respecter les sources de vérité définies dans :

- [SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/SOURCES_DE_VERITE_ENTRE_PLATEFORMES.md)

L'IA ne doit jamais créer seule une donnée venant remplacer une donnée de référence issue :

- de la plateforme de gestion des commandes
- du système d'appel
- du suivi logistique
- d'une autre application métier déjà source de vérité

L'IA peut :

- interpréter
- résumer
- proposer
- préparer

L'IA ne peut pas :

- imposer une vérité métier externe
- écraser une donnée de référence

## 12. Relations avec la plateforme de gestion des commandes

Les usages IA doivent être compatibles avec les échanges définis dans :

- [SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md](C:/Users/gbamb/Desktop/projet/whatsapp/SPEC_ECHANGES_DONNEES_PLATEFORME_CONVERSATION_GESTION_COMMANDE.md)
- [RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md](C:/Users/gbamb/Desktop/projet/whatsapp/RESUME_DONNEES_A_ECHANGER_ENTRE_PLATEFORMES.md)

Cela implique notamment :

- ne pas casser les corrélations par numéro de téléphone
- ne pas introduire de dépendance à un identifiant IA propre sans valeur métier
- conserver la cohérence avec les dossiers client et le suivi commande

## 13. Exigences UX

Les interfaces doivent :

- rendre visibles les états IA
- rendre visibles les validations humaines
- afficher les erreurs proprement
- afficher les fallbacks quand ils sont utilisés
- distinguer clairement contenu généré, contenu validé et contenu statique

Pour les admins :

- l'impact métier d'une activation doit être compréhensible
- les champs obligatoires doivent être visibles
- les scénarios à risque doivent être signalés

Pour les commerciaux :

- l'IA doit assister sans ralentir
- les actions doivent rester compréhensibles
- la validation finale doit rester simple

## 14. Exigences de test et recette

## 14.1 Tests unitaires

Il faut couvrir :

- les règles d'activation
- les règles de fallback
- les validations de champs obligatoires
- les blocages métier
- les contrôles de sécurité

## 14.2 Tests d'intégration

Il faut couvrir :

- configuration admin vers comportement backend
- comportement des modules selon le statut admin
- exécutions avec et sans fallback
- exécutions avec validation humaine

## 14.3 Tests E2E

Il faut couvrir :

- activation module depuis l'admin
- effet visible dans l'interface commerciale
- scénario FlowBot avec nœud IA
- suspension d'un module
- affichage des journaux

## 14.4 Recette métier

La recette doit vérifier :

- que l'IA ne dépasse pas son rôle
- que les scénarios sensibles sont bien encadrés
- que les fallbacks fonctionnent
- que les prompts métiers produisent des sorties acceptables

## 15. Livrables attendus

Les livrables attendus sont :

- écrans admin IA
- APIs backend de configuration
- stockage des configurations IA
- journal d'exécution IA
- intégration des règles de sécurité
- intégration des validations humaines
- adaptation des modules existants
- tests
- documentation technique
- documentation fonctionnelle

## 16. Phasage recommandé

## Phase 1 : fondations

- configuration globale IA
- configuration par module
- journalisation de base
- dashboard global IA
- durcissement sécurité de base

## Phase 2 : consolidation des usages existants

- suggestions de réponses
- correction/réécriture
- résumé conversation
- alignement avec droits admin

## Phase 3 : FlowBot IA gouverné

- configuration FlowBot IA
- configuration des nœuds IA
- contraintes et interdictions
- fallback obligatoire

## Phase 4 : qualification et relance

- qualification assistée
- relance assistée
- validations humaines
- audit enrichi

## Phase 5 : synthèse dossier client et supervision

- synthèse IA dossier client
- vues managériales
- coaching
- indicateurs qualité

## 17. Critères d'acceptation

Le projet sera considéré conforme si les conditions suivantes sont remplies :

- chaque module IA peut être activé ou désactivé indépendamment
- l'admin peut gouverner l'ensemble des usages IA
- les messages FlowBot IA sont encadrés par contexte, ton, contraintes et fallback
- les modules sensibles peuvent exiger une validation humaine
- les usages IA sont journalisés
- les coûts et performances sont visibles
- les interfaces commerciales respectent les décisions prises dans l'admin
- les sources de vérité externes restent protégées

## 18. Risques à maîtriser

Les principaux risques à maîtriser sont :

- activation trop large de l'IA
- absence de cadre sur les messages générés
- réponses non conformes
- dérive des coûts
- dépendance excessive à un fournisseur
- confusion entre suggestion IA et vérité métier
- mauvaise adoption utilisateur si les sorties sont trop génériques

## 19. Conclusion

Ce cahier des charges fixe un cadre d'implémentation de l'IA cohérent avec les besoins métier exprimés et avec les documents déjà produits dans le projet.

L'objectif n'est pas simplement d'ajouter de l'IA, mais de construire une IA :

- utile pour les commerciaux
- utile pour le suivi client
- utile pour l'administration
- pilotable
- traçable
- sécurisée

La réussite du projet dépendra surtout de la capacité à transformer les usages IA en fonctionnalités administrables, mesurables et compatibles avec les sources de vérité et les processus métier existants.
