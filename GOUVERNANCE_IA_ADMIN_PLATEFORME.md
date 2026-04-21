# Gouvernance IA dans l'interface admin

Date : 21 avril 2026

## 1. Objet du document

Ce document définit comment l'intelligence artificielle doit être gouvernée depuis l'interface d'administration de la plateforme.

L'objectif est simple :

- aucun usage IA ne doit être imposé
- tous les usages IA doivent être optionnels
- l'admin doit pouvoir activer, désactiver et encadrer chaque cas d'usage
- chaque usage doit être sécurisé par des paramètres métier, des limites et des validations

Ce document complète le rapport général sur l'utilisation de l'IA et se concentre uniquement sur la gouvernance fonctionnelle et opérationnelle dans l'admin.

## 2. Principe fondamental

Toute fonctionnalité IA de la plateforme doit respecter les règles suivantes :

- elle doit être désactivable
- elle doit être configurable depuis l'interface admin
- elle ne doit jamais être activée globalement sans contrôle fin par module
- elle doit pouvoir être encadrée par des règles métier
- elle doit pouvoir être auditée
- elle doit avoir un fallback non IA quand cela est nécessaire

En conséquence :

- configurer une clé API ne doit pas activer automatiquement tous les usages IA
- activer un fournisseur IA ne doit pas autoriser tous les modules à l'utiliser
- chaque module doit avoir sa propre autorisation
- chaque scénario critique doit pouvoir exiger une validation humaine

## 3. Niveaux de gouvernance à prévoir

La gouvernance IA dans l'admin doit être organisée à 4 niveaux.

### Niveau 1 : gouvernance globale

Permet de définir :

- le fournisseur IA autorisé
- le ou les modèles autorisés
- l'état global de disponibilité du service IA
- les plafonds de coût
- les plafonds de latence
- les règles générales de sécurité
- la politique de masquage des données sensibles

Ce niveau ne doit pas suffire à activer les usages métier.

### Niveau 2 : gouvernance par module

Chaque grand module doit avoir son propre interrupteur d'activation.

Exemples :

- suggestions de réponses commerciales
- correction/réécriture
- résumé IA de conversation
- qualification assistée
- FlowBot avec génération IA
- relance assistée
- synthèse dossier client
- coaching ou analyse qualité

### Niveau 3 : gouvernance par scénario

Dans un même module, chaque scénario doit pouvoir être configuré séparément.

Exemples :

- FlowBot accueil initial
- FlowBot reprise après silence
- FlowBot hors horaires
- relance après intérêt détecté
- relance après commande annulée
- relance après première livraison
- qualification fin de conversation

### Niveau 4 : gouvernance par message ou action

Dans certains cas, il faut aller jusqu'au niveau d'un message ou d'une action individuelle.

Exemple typique :

- dans un flow conversationnel, un message donné peut être statique
- un autre message peut être généré par IA
- chaque message généré par IA doit avoir ses propres paramètres

## 4. Modules IA à piloter dans l'admin

## 4.1 Suggestions de réponses pour les commerciaux

L'admin doit pouvoir définir :

- activation oui/non
- profils autorisés
- canaux autorisés
- longueur maximale des suggestions
- nombre de suggestions affichées
- types de conversations concernées
- fallback si l'IA ne répond pas

Règles recommandées :

- usage autorisé uniquement en assistance
- aucune suggestion ne doit être envoyée automatiquement
- le commercial garde toujours la validation finale

## 4.2 Correction / réécriture de texte

L'admin doit pouvoir définir :

- activation oui/non
- modes autorisés
- ton par défaut
- niveau de formalité
- longueur maximale
- usage autorisé avant envoi uniquement

Exemples de modes activables séparément :

- corriger
- améliorer
- formaliser
- raccourcir

Règles recommandées :

- ne jamais envoyer automatiquement le texte réécrit
- toujours laisser l'agent relire avant envoi

## 4.3 Résumé IA de conversation

L'admin doit pouvoir définir :

- activation oui/non
- rôles autorisés
- profondeur du résumé
- nombre maximal de points clés
- type d'actions suggérées
- stockage ou non du résumé
- durée de conservation

Règles recommandées :

- distinguer résumé instantané et résumé sauvegardé
- journaliser quand un résumé IA est généré

## 4.4 Qualification assistée de conversation

L'admin doit pouvoir définir :

- activation oui/non
- champs que l'IA a le droit de proposer
- champs que l'IA ne peut jamais remplir automatiquement
- niveau de confiance minimal requis
- obligation ou non de validation humaine

Exemples de sorties possibles :

- statut proposé
- résultat proposé
- motif de non conversion
- besoin de relance
- date suggérée de rappel
- niveau d'intérêt

Règles recommandées :

- l'IA propose
- l'utilisateur valide
- la source de vérité reste métier et non IA

## 4.5 FlowBot avec réponse IA

C'est l'un des modules les plus sensibles.

L'admin doit pouvoir définir au niveau global du module FlowBot :

- si FlowBot a le droit d'utiliser l'IA ou non
- sur quels canaux
- à quels horaires
- sur quels types de scénarios
- avec ou sans validation humaine
- avec ou sans fallback statique

Ensuite, dans la construction d'un flow, chaque nœud de type message doit pouvoir être défini comme :

- message statique
- message généré par IA

Si le message est généré par IA, il faut obligatoirement configurer :

- le contexte métier
- l'objectif du message
- le ton
- le niveau de formalité
- les éléments obligatoires
- les éléments interdits
- les limites de longueur
- les règles de sécurité
- le texte de fallback

Exemples de contexte possibles :

- accueil
- qualification
- demande d'information
- orientation vers appel
- relance douce
- reprise après silence
- réponse hors horaires

Exemples de ton possibles :

- professionnel
- commercial
- rassurant
- empathique
- neutre
- direct

Exemples d'interdictions possibles :

- ne jamais promettre une livraison
- ne jamais confirmer un stock sans source de vérité
- ne jamais annoncer un prix non validé
- ne jamais utiliser un ton insistant après refus
- ne jamais demander une information interdite

Règle forte :

- un nœud IA ne doit pas être publiable si ses contraintes ne sont pas renseignées

## 4.6 Relance assistée par IA

L'admin doit pouvoir définir :

- activation oui/non
- scénarios de relance autorisés
- délai minimal entre deux relances
- nombre maximal de relances
- catégories de clients autorisées
- validation humaine obligatoire ou non
- exclusions

Exemples de scénarios séparés :

- relance après premier contact
- relance après intérêt sans commande
- relance après annulation
- relance post-livraison
- relance réachat

Règles recommandées :

- une relance IA ne doit jamais être libre de contexte
- chaque scénario doit avoir son cadre, son ton et ses limites

## 4.7 Synthèse dossier client

L'admin doit pouvoir définir :

- activation oui/non
- sources prises en compte
- fréquence de génération
- rôles autorisés à voir la synthèse
- champs affichables
- champs sensibles masqués

Règles recommandées :

- la synthèse IA aide à lire le dossier
- elle ne remplace jamais les données sources

## 4.8 Coaching et analyse qualité

L'admin doit pouvoir définir :

- activation oui/non
- population analysée
- critères analysés
- fréquence d'analyse
- visibilité des résultats
- utilisation ou non dans les dashboards managériaux

Règles recommandées :

- ne jamais produire de note opaque
- toujours afficher les critères et la justification
- ne jamais utiliser seul un score IA comme base disciplinaire

## 5. Paramètres standards à prévoir pour chaque usage IA

Chaque fonctionnalité IA dans l'admin devrait idéalement avoir une fiche de configuration commune.

Champs recommandés :

- nom du module
- statut activé/désactivé
- description fonctionnelle
- fournisseur ou modèle autorisé
- rôles autorisés
- canaux autorisés
- horaires autorisés
- catégories de clients autorisées
- type de validation requise
- fallback prévu
- journalisation activée oui/non
- conservation des traces oui/non

Paramètres métier spécifiques :

- contexte
- objectif
- ton
- style
- longueur maximale
- langue
- éléments obligatoires
- éléments interdits
- niveau de prudence
- niveau de personnalisation

Paramètres de sécurité :

- masquage des numéros oui/non
- masquage des noms oui/non
- masquage des adresses oui/non
- blocage de promesses commerciales non vérifiées
- blocage des données sensibles
- alerte si le contenu sort du cadre

## 6. Etats fonctionnels recommandés dans l'admin

Pour chaque module IA, il est recommandé d'avoir un état clair parmi :

- désactivé
- activé en test
- activé avec validation humaine
- activé en production encadrée
- suspendu pour incident

Cela permet d'éviter un simple modèle binaire trop pauvre.

## 7. Règles de validation humaine

L'admin doit pouvoir définir si une action IA nécessite :

- aucune validation
- validation par le commercial
- validation par un superviseur
- validation systématique sur certains profils clients

Les cas suivants doivent être fortement encadrés :

- certification client
- message automatique sur client mécontent
- message après litige
- promesse de prix
- promesse de livraison
- message de recouvrement
- message lié à une commande sensible

## 8. Règles d'audit et de traçabilité

L'admin doit avoir accès à des journaux clairs sur l'utilisation de l'IA.

Pour chaque exécution IA, il faut idéalement tracer :

- date et heure
- module concerné
- scénario concerné
- utilisateur ou système déclencheur
- canal concerné
- type d'action
- modèle utilisé
- durée de génération
- résultat succès/échec
- fallback utilisé ou non
- validation humaine effectuée ou non

L'objectif n'est pas seulement technique, mais aussi métier :

- comprendre les usages
- contrôler les risques
- mesurer la valeur

## 9. Dashboard admin IA recommandé

Le panneau admin devrait inclure une vue dédiée IA avec au minimum :

- état global du service IA
- modules actifs
- scénarios actifs
- nombre d'utilisations par module
- taux d'échec
- taux de fallback
- coût estimé
- latence moyenne
- volume par canal
- usages nécessitant une revue

Il faudrait aussi afficher :

- les modules récemment modifiés
- les scénarios sans fallback
- les scénarios IA sans contraintes définies
- les usages suspendus

## 10. Règles UX à respecter dans l'interface admin

L'admin ne doit pas seulement avoir des interrupteurs techniques. L'interface doit rendre les décisions compréhensibles.

Il faut donc prévoir :

- une description claire de chaque module IA
- les risques de chaque activation
- les dépendances éventuelles
- les conséquences métier
- les limites de responsabilité

Pour les FlowBots en particulier :

- le choix entre message statique et message IA doit être explicite
- les champs contexte, ton et contraintes doivent être visibles
- l'absence de contraintes doit empêcher la publication
- un aperçu de génération devrait être possible avant activation

## 11. Décisions fonctionnelles recommandées

Voici les décisions les plus importantes à retenir.

### Décision 1

Tous les usages IA doivent être optionnels et pilotés dans l'admin.

### Décision 2

L'activation globale d'un fournisseur IA ne doit jamais activer automatiquement tous les modules.

### Décision 3

Chaque module doit avoir sa propre configuration métier.

### Décision 4

Chaque scénario sensible doit avoir des contraintes explicites.

### Décision 5

Les messages générés automatiquement doivent toujours être bornés par :

- un contexte
- un ton
- des interdictions
- un fallback

### Décision 6

Les usages critiques doivent rester sous validation humaine.

### Décision 7

Tous les usages IA importants doivent être auditables.

## 12. Conclusion

La bonne gouvernance IA ne consiste pas à brancher un fournisseur puis laisser tous les modules l'utiliser librement. Elle consiste à transformer l'IA en capacité contrôlée, encadrée et pilotable.

Pour cette plateforme, cela implique :

- une activation modulaire
- une configuration métier détaillée
- une validation humaine sur les cas sensibles
- une traçabilité complète
- une séparation claire entre IA autorisée, IA restreinte et IA interdite

La règle la plus importante est donc :

- l'IA doit être disponible
- mais son usage doit toujours être décidé, borné et contrôlé depuis l'interface admin
