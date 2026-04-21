# Spécification des écrans admin pour la gouvernance IA

Date : 21 avril 2026

## 1. Objet du document

Ce document décrit de manière opérationnelle les écrans à développer dans l'interface admin pour piloter l'intelligence artificielle de la plateforme.

L'objectif est de fournir une base claire pour :

- le design fonctionnel
- le développement front admin
- le développement backend de configuration
- les règles de validation

Ce document ne traite pas la logique métier complète de chaque module IA. Il se concentre sur les écrans, les champs, les actions et les comportements attendus dans l'admin.

## 2. Objectifs fonctionnels

L'interface admin doit permettre :

- d'activer ou désactiver chaque usage IA séparément
- de configurer le fournisseur et les modèles
- de piloter les autorisations par module
- de piloter les scénarios IA
- de configurer les messages générés par IA
- de définir le contexte, le ton, les contraintes et les interdictions
- d'imposer des validations humaines sur les cas sensibles
- de consulter l'historique d'utilisation et les incidents

## 3. Arborescence recommandée dans l'admin

Nouvelle section principale :

- `Intelligence Artificielle`

Sous-menus recommandés :

- `Vue d'ensemble`
- `Configuration globale`
- `Modules IA`
- `Scénarios`
- `FlowBot IA`
- `Prompts et contraintes`
- `Validation humaine`
- `Audit et journal`
- `Coûts et performances`

## 4. Ecran 1 : Vue d'ensemble IA

## 4.1 Objectif

Donner à l'admin une vision immédiate de l'état global de l'IA sur la plateforme.

## 4.2 Blocs à afficher

### Bloc A : état global

Cartes de synthèse :

- statut du service IA
- fournisseur actif
- modèle par défaut
- nombre de modules activés
- nombre de scénarios actifs
- nombre de scénarios en test
- nombre d'incidents récents

### Bloc B : usage récent

Indicateurs :

- nombre d'exécutions aujourd'hui
- taux d'échec
- taux de fallback
- temps moyen de réponse
- coût estimé du jour

### Bloc C : alertes

Liste des alertes :

- scénario IA sans fallback
- module activé sans contraintes
- hausse anormale des erreurs
- hausse anormale de coût
- scénario suspendu

### Bloc D : accès rapide

Boutons :

- `Configurer le fournisseur`
- `Gérer les modules`
- `Voir les scénarios`
- `Voir les journaux`
- `Suspendre un module`

## 4.3 Filtres

Filtres recommandés :

- période
- module
- canal
- statut

## 5. Ecran 2 : Configuration globale

## 5.1 Objectif

Configurer la couche technique globale sans activer automatiquement les usages métier.

## 5.2 Sections

### Section A : fournisseur IA

Champs :

- `Fournisseur`
- `Modèle par défaut`
- `URL API`
- `Clé API`
- `Timeout max`
- `Nombre max de tentatives`

Types de champs :

- liste déroulante
- champ texte
- champ secret
- champ numérique

### Section B : politique globale

Champs :

- `Activer le service IA global`
- `Autoriser les modules à utiliser l'IA`
- `Activer le fallback global`
- `Activer la journalisation`
- `Conserver les traces d'exécution`
- `Masquer les numéros de téléphone`
- `Masquer les noms`
- `Masquer les adresses`

Type :

- interrupteurs oui/non

### Section C : limites globales

Champs :

- `Coût maximal journalier`
- `Coût maximal mensuel`
- `Latence maximale acceptable`
- `Nombre maximal d'appels par minute`

### Section D : sécurité

Champs :

- `Bloquer les promesses non vérifiées`
- `Bloquer la génération si données sensibles détectées`
- `Bloquer la génération hors plages autorisées`
- `Exiger un fallback pour tout scénario automatique`

## 5.3 Actions

Boutons :

- `Tester la connexion`
- `Enregistrer`
- `Annuler`
- `Suspendre temporairement l'IA`

## 5.4 Règles de validation

- la clé API ne doit jamais être affichée en clair après enregistrement
- l'activation globale ne doit pas activer les modules automatiquement
- si le service IA est suspendu, les modules restent configurés mais non exécutables

## 6. Ecran 3 : Liste des modules IA

## 6.1 Objectif

Permettre de gérer indépendamment chaque module IA.

## 6.2 Tableau des modules

Colonnes recommandées :

- `Nom du module`
- `Description`
- `Statut`
- `Canaux`
- `Validation humaine`
- `Fallback`
- `Dernière modification`
- `Actions`

## 6.3 Modules à prévoir

Ligne par module :

- suggestions de réponses
- correction/réécriture
- résumé IA de conversation
- qualification assistée
- FlowBot IA
- relance assistée
- synthèse dossier client
- coaching / qualité

## 6.4 Actions par ligne

Boutons :

- `Activer`
- `Désactiver`
- `Configurer`
- `Suspendre`
- `Voir audit`

## 6.5 Etats recommandés

Valeurs possibles :

- `Désactivé`
- `Test`
- `Actif avec validation`
- `Actif`
- `Suspendu`

## 7. Ecran 4 : Fiche d'un module IA

## 7.1 Objectif

Configurer un module donné avec ses autorisations et ses limites.

## 7.2 Structure de la fiche

### Section A : identité du module

Champs :

- `Nom`
- `Code module`
- `Description`
- `Statut`

### Section B : périmètre

Champs :

- `Canaux autorisés`
- `Rôles autorisés`
- `Horaires autorisés`
- `Catégories client autorisées`
- `Langues autorisées`

### Section C : comportement

Champs :

- `Autoriser génération IA`
- `Validation humaine requise`
- `Fallback obligatoire`
- `Mode test uniquement`
- `Visible par les commerciaux`

### Section D : limites métier

Champs :

- `Longueur maximale`
- `Niveau de personnalisation`
- `Niveau de prudence`
- `Nombre max d'exécutions par conversation`
- `Nombre max d'exécutions par client`

### Section E : sécurité

Champs :

- `Bloquer si données sensibles`
- `Bloquer si aucune source de vérité`
- `Bloquer promesses de livraison`
- `Bloquer promesses de stock`
- `Bloquer promesses de prix`

## 7.3 Actions

- `Enregistrer`
- `Enregistrer et tester`
- `Suspendre le module`
- `Réinitialiser`

## 8. Ecran 5 : Liste des scénarios IA

## 8.1 Objectif

Gérer les scénarios fonctionnels à l'intérieur des modules.

## 8.2 Tableau des scénarios

Colonnes :

- `Nom du scénario`
- `Module`
- `Type`
- `Canal`
- `Statut`
- `Validation`
- `Fallback`
- `Dernière exécution`
- `Actions`

## 8.3 Exemples de scénarios

- accueil automatique
- reprise après silence
- résumé de conversation
- qualification de fin d'échange
- relance après intérêt
- relance après annulation
- message post-livraison

## 8.4 Actions

- `Créer`
- `Dupliquer`
- `Modifier`
- `Tester`
- `Activer`
- `Désactiver`
- `Suspendre`

## 9. Ecran 6 : Fiche scénario IA

## 9.1 Objectif

Définir précisément les règles d'un scénario.

## 9.2 Sections

### Section A : identité

Champs :

- `Nom du scénario`
- `Module parent`
- `Code scénario`
- `Description`
- `Statut`

### Section B : conditions d'exécution

Champs :

- `Canal`
- `Type de conversation`
- `Statut conversation requis`
- `Catégorie client`
- `Plage horaire`
- `Jours autorisés`
- `Déclencheur`

Exemples de déclencheur :

- entrée dans flow
- fin de conversation
- absence de réponse
- clic admin
- action commercial

### Section C : règles de validation

Champs :

- `Exécution automatique autorisée`
- `Validation commercial requise`
- `Validation superviseur requise`
- `Mode test`

### Section D : stratégie de repli

Champs :

- `Fallback activé`
- `Type de fallback`
- `Texte fallback`
- `Action fallback`

Types de fallback :

- message statique
- aucune action
- remonter une alerte
- demander validation humaine

## 9.3 Actions

- `Enregistrer`
- `Tester ce scénario`
- `Prévisualiser`
- `Publier`
- `Suspendre`

## 9.4 Règles de validation

- un scénario automatique doit obligatoirement avoir un fallback
- un scénario sensible ne peut pas être publié sans niveau de validation défini
- un scénario sans contraintes ne doit pas être publiable

## 10. Ecran 7 : FlowBot IA

## 10.1 Objectif

Permettre de piloter les usages IA dans les flows conversationnels.

## 10.2 Vue liste des flows

Colonnes :

- `Nom du flow`
- `Canal`
- `Statut`
- `Nœuds IA`
- `Nœuds sans fallback`
- `Dernière modification`
- `Actions`

## 10.3 Fiche d'un flow

Sections :

- informations générales
- autorisations IA du flow
- liste des nœuds
- état de publication
- validation de sécurité

Champs globaux du flow :

- `Autoriser l'IA dans ce flow`
- `Mode test`
- `Exiger validation sur les nœuds sensibles`
- `Fallback obligatoire pour chaque nœud IA`

## 10.4 Fiche d'un nœud message

Pour chaque nœud message, l'admin ou le concepteur doit choisir :

- `Message statique`
- `Message généré par IA`

Si `Message statique` :

- champ texte
- variables autorisées

Si `Message généré par IA` :

- `Contexte`
- `Objectif`
- `Ton`
- `Niveau de formalité`
- `Longueur max`
- `Eléments obligatoires`
- `Eléments interdits`
- `Interdictions métier`
- `Fallback texte`
- `Validation requise`

## 10.5 Aide à la saisie

Prévoir :

- listes de contexte prédéfinies
- listes de ton prédéfinies
- bibliothèques d'interdictions métier
- aperçu du prompt final
- aperçu du message généré

## 10.6 Règles de blocage

Un nœud IA ne doit pas être publiable si :

- le contexte est vide
- le ton est vide
- les interdictions métier sont absentes
- le fallback manque pour un nœud automatique

## 11. Ecran 8 : Bibliothèque de prompts et contraintes

## 11.1 Objectif

Centraliser les blocs réutilisables.

## 11.2 Onglets

- `Contextes`
- `Tons`
- `Contraintes`
- `Interdictions`
- `Fallbacks`
- `Templates`

## 11.3 Exemple de fiche contrainte

Champs :

- `Nom`
- `Type`
- `Description`
- `Texte de règle`
- `Modules compatibles`
- `Scénarios compatibles`
- `Active`

Exemples de règles :

- ne jamais promettre une livraison
- ne jamais confirmer un stock sans validation
- ne jamais annoncer un prix si non fourni par la source de vérité
- ne jamais insister après un refus explicite

## 12. Ecran 9 : Validation humaine

## 12.1 Objectif

Configurer les règles de validation sur les cas sensibles.

## 12.2 Sections

### Section A : matrice de validation

Tableau :

- `Module`
- `Scénario`
- `Cas standard`
- `Cas sensible`
- `Niveau de validation`

Valeurs possibles :

- aucune
- commercial
- superviseur
- admin

### Section B : règles sensibles

Exemples :

- client mécontent
- litige
- demande spéciale
- prix exceptionnel
- promesse de livraison
- certification client

### Section C : files d'attente de validation

Liste :

- messages en attente
- résumés en attente
- qualifications en attente
- relances en attente

## 13. Ecran 10 : Audit et journal

## 13.1 Objectif

Consulter toutes les exécutions IA.

## 13.2 Tableau principal

Colonnes :

- `Date`
- `Module`
- `Scénario`
- `Utilisateur / système`
- `Canal`
- `Résultat`
- `Durée`
- `Fallback`
- `Validation`
- `Action`

## 13.3 Filtres

- période
- module
- scénario
- succès / échec
- fallback oui/non
- validation oui/non

## 13.4 Détail d'une exécution

Sections :

- métadonnées
- entrée résumée
- contraintes appliquées
- résultat généré
- fallback éventuel
- décision humaine éventuelle

Règle importante :

- ne pas afficher en clair les données sensibles si la politique de masquage est activée

## 14. Ecran 11 : Coûts et performances

## 14.1 Objectif

Piloter la performance économique et technique des usages IA.

## 14.2 Indicateurs

- coût journalier
- coût mensuel
- coût par module
- coût par scénario
- latence moyenne
- latence max
- taux de réussite
- taux d'échec
- taux de fallback

## 14.3 Graphiques

- volume par jour
- coût par jour
- latence par module
- erreurs par scénario

## 14.4 Actions

- `Définir alerte coût`
- `Définir alerte latence`
- `Suspendre un scénario`
- `Suspendre un module`

## 15. Composants UI réutilisables

Pour accélérer le développement, prévoir les composants suivants :

- `StatusBadge`
- `ToggleCard`
- `ScenarioTable`
- `ModuleSettingsForm`
- `PromptConstraintEditor`
- `FallbackEditor`
- `ValidationMatrix`
- `AuditLogTable`
- `ExecutionDetailDrawer`
- `CostMetricsCards`

## 16. Règles UX transverses

L'interface doit rendre visibles les risques et les dépendances.

Règles recommandées :

- afficher des badges de risque
- afficher clairement si un module est automatique ou soumis à validation
- afficher un avertissement avant publication d'un scénario sensible
- afficher les champs obligatoires manquants
- afficher un aperçu avant activation
- afficher la dernière modification et son auteur

## 17. Etats vides et messages système

Exemples :

- `Aucun module IA configuré`
- `Aucun scénario actif`
- `Aucune exécution trouvée`
- `Le service IA global est suspendu`
- `Certains scénarios sont bloqués par absence de fallback`

## 18. Priorité de développement recommandée

## Phase 1

- Vue d'ensemble
- Configuration globale
- Liste des modules IA
- Fiche module IA

## Phase 2

- Liste des scénarios
- Fiche scénario
- Validation humaine

## Phase 3

- FlowBot IA
- Bibliothèque de prompts et contraintes

## Phase 4

- Audit et journal
- Coûts et performances

## 19. Conclusion

L'admin IA ne doit pas être une simple page technique de configuration de fournisseur. Elle doit devenir un vrai poste de pilotage fonctionnel.

La priorité est de permettre à l'entreprise de décider :

- où l'IA est autorisée
- dans quelles conditions
- avec quelles contraintes
- avec quel niveau de validation
- avec quelle traçabilité

Cette spécification peut servir de base de maquettage UI, puis de découpage en tickets front et backend.
