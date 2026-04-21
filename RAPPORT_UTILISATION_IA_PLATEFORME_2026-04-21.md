# Rapport complet sur l'utilisation de l'IA dans la plateforme

Date : 21 avril 2026

## 1. Objet du rapport

Ce document analyse l'utilisation actuelle de l'intelligence artificielle dans l'ensemble du projet, en particulier dans :

- `message_whatsapp` : backend conversationnel
- `front` : interface des commerciaux
- `admin` : panneau d'administration

L'objectif est de distinguer :

- ce qui est réellement de l'IA
- ce qui est de l'automatisation classique
- ce qui est bien conçu
- ce qui est faible, incomplet ou risqué
- ce qui devrait être amélioré selon les différents contextes métier de la plateforme

Ce rapport se base sur les documents déjà produits dans le projet et sur l'analyse du code existant.

## 2. Résumé exécutif

L'IA est déjà présente dans la plateforme, mais son usage reste aujourd'hui concentré sur l'assistance conversationnelle. Le projet dispose déjà de briques utiles :

- suggestions de réponses pour les commerciaux
- résumé IA des conversations
- réécriture/correction de texte avant envoi
- réponse automatique IA dans les FlowBots
- analyse de sentiment légère sur les messages entrants

Globalement, la base technique est bonne pour un premier niveau d'assistance. En revanche, l'IA n'est pas encore utilisée comme un vrai levier métier transverse. Elle aide à écrire et à résumer, mais elle ne structure pas encore assez le suivi client, la qualification commerciale, la relance, la supervision, le coaching des commerciaux, ni la coordination avec la plateforme de gestion des commandes.

Le principal problème n'est donc pas l'absence d'IA, mais le fait que son usage reste encore partiel, peu gouverné, peu tracé, peu contextualisé et pas assez connecté aux décisions métier.

## 3. Etat actuel des usages IA

## 3.1 Usages IA réellement présents

### A. Suggestions de réponses pour les commerciaux

Le backend expose un endpoint pour générer des suggestions de réponse contextualisées à partir de l'historique de conversation.

Fonction observée :

- génération de 3 suggestions courtes
- prise en compte du contexte conversationnel
- affichage côté interface commerciale
- possibilité pour le commercial de réutiliser une suggestion

Apport :

- gain de temps
- aide au traitement rapide
- réduction des réponses improvisées

### B. Réécriture / correction de texte

Le backend propose un endpoint de réécriture avec plusieurs modes :

- correction
- amélioration
- formulation plus formelle
- version plus courte

Cette capacité est déjà intégrée dans l'interface de chat du commercial.

Apport :

- meilleure qualité rédactionnelle
- réduction des fautes
- amélioration du ton commercial
- homogénéisation partielle du niveau de communication

### C. Résumé IA de conversation

Le backend génère un résumé structuré d'une conversation avec :

- un résumé général
- un sentiment global
- des points clés
- des actions suggérées

Ce résumé est visible côté `front`.

Apport :

- accélère la reprise d'une conversation
- utile pour les superviseurs
- réduit le temps nécessaire pour comprendre l'historique

### D. AI_REPLY dans les FlowBots

Le moteur de FlowBot peut déclencher une réponse générée par l'IA quand un nœud `AI_REPLY` est utilisé.

Cela signifie que la plateforme permet déjà :

- une automatisation conversationnelle pilotée par IA
- un fallback si l'IA est indisponible
- une configuration centralisée du fournisseur IA

Apport :

- automatisation partielle de certains échanges
- gain de capacité sur des cas répétitifs

### E. Analyse de sentiment sur les messages entrants

Le backend dispose d'un module de sentiment qui analyse certains messages entrants textuels et enregistre :

- un score
- un label de sentiment

Cette analyse est asynchrone via une queue, ce qui évite de bloquer le pipeline principal.

Apport :

- premier niveau d'analyse comportementale
- possibilité future de prioriser certaines conversations

## 3.2 Ce qui n'est pas vraiment de l'IA

Le projet contient aussi plusieurs mécanismes intelligents au sens fonctionnel, mais qui ne sont pas de l'IA au sens strict.

### A. Score d'engagement côté interface

Le `front` calcule un score d'engagement à partir de règles simples :

- nombre d'appels
- récence
- nombre de messages
- statut de conversion

Ce score est utile, mais il s'agit d'un calcul heuristique métier, pas d'un modèle IA.

### B. FlowBots et règles d'automatisation

Une grande partie de l'automatisation observée relève de règles :

- conditions
- déclencheurs
- actions automatiques
- branches de scénarios

C'est très utile, mais il faut bien distinguer :

- automatisation déterministe
- assistance générative IA

La plateforme a aujourd'hui davantage de logique d'automatisation que de logique d'intelligence métier pilotée par IA.

## 4. Points positifs de l'implémentation actuelle

## 4.1 Architecture assez saine pour démarrer

L'IA n'a pas été codée en dur autour d'un seul fournisseur. Le backend supporte plusieurs modes :

- `anthropic`
- `openai`
- `ollama`
- `custom`
- endpoint compatible OpenAI

Cela est un vrai point fort.

Avantages :

- flexibilité
- réduction du risque de dépendance à un seul fournisseur
- possibilité d'utiliser un modèle local plus tard
- meilleure maîtrise des coûts si besoin

## 4.2 Configuration centralisée

Les paramètres IA sont pilotés via la configuration système.

Exemples observés :

- fournisseur
- modèle
- clé API
- URL API
- activation du mode IA dans les FlowBots

C'est une bonne pratique de gouvernance technique.

Cette logique doit toutefois être renforcée par une règle plus stricte :

- chaque cas d'usage IA doit être optionnel
- chaque activation doit être décidée depuis l'interface admin
- chaque usage doit pouvoir être activé ou désactivé indépendamment
- chaque usage doit avoir ses propres paramètres métier et de sécurité

## 4.3 Présence de fallback fonctionnels

Quand l'IA n'est pas disponible, le système dispose de comportements de repli :

- suggestions génériques
- résumé simplifié
- texte de fallback pour les FlowBots

C'est important pour éviter qu'une panne IA bloque l'activité commerciale.

## 4.4 Bonne séparation entre traitement temps réel et tâches asynchrones

L'analyse de sentiment est déclenchée via une queue et non directement dans le flux principal de réception.

Avantages :

- meilleure résilience
- meilleure performance
- base saine pour ajouter d'autres traitements IA asynchrones plus tard

## 4.5 L'IA est déjà visible dans l'expérience commerciale

Contrairement à beaucoup de projets où l'IA existe uniquement dans le backend, ici elle est déjà intégrée dans l'interface commerciale avec des usages concrets :

- suggestions
- correction/réécriture
- résumé

Cela augmente la probabilité d'adoption, à condition d'améliorer la pertinence.

## 5. Faiblesses, limites et risques actuels

## 5.1 L'IA aide à écrire, mais n'aide pas encore assez à vendre ni à suivre le client

C'est aujourd'hui la limite principale.

L'IA agit surtout comme :

- assistant de formulation
- assistant de résumé

Mais pas encore assez comme :

- assistant de qualification commerciale
- assistant de suivi client
- assistant de relance
- assistant de conversion
- assistant de supervision

Or le besoin exprimé dans vos réunions va beaucoup plus loin : suivi complet du client, logique de portefeuille, logique bancaire, relances, catégorisation, qualité de traitement, classement des commerciaux.

## 5.2 L'analyse de sentiment est trop simple pour des décisions métier fortes

L'analyse actuelle est lexicale, donc basée sur des listes de mots.

C'est bien pour un premier niveau, mais insuffisant pour :

- détecter les intentions complexes
- comprendre les objections
- comprendre le sarcasme
- distinguer hésitation, intérêt faible, intérêt fort, refus, urgence, confiance ou méfiance
- piloter une relance commerciale fiable

Conclusion :

- utile comme signal secondaire
- dangereux comme signal principal de décision

## 5.3 Absence visible de gouvernance des données sensibles

Les conversations clients peuvent contenir :

- numéros de téléphone
- noms
- adresses
- informations personnelles
- détails de commande

L'implémentation actuelle montre l'envoi de contexte conversationnel aux fournisseurs IA, mais on ne voit pas de mécanisme fort et systématique de :

- masquage des données sensibles
- anonymisation
- filtrage avant envoi
- journal d'audit sur ce qui a été transmis à un fournisseur externe

Pour une plateforme qui veut aller vers un suivi client de type bancaire, c'est une faiblesse importante.

## 5.4 Faible traçabilité métier de la valeur produite par l'IA

On ne voit pas encore de couche claire de mesure de l'efficacité de l'IA :

- taux d'utilisation des suggestions
- taux d'acceptation des réécritures
- impact sur le temps de réponse
- impact sur le taux de conversion
- impact sur la qualité conversationnelle
- coût par usage IA
- latence par usage

Sans ces métriques, il sera difficile de savoir si l'IA aide réellement le business.

## 5.5 L'IA ne semble pas encore produire assez de données structurées réutilisables

Le vrai gain métier ne vient pas seulement d'un texte généré, mais d'une structuration exploitable.

Aujourd'hui, il faudrait aller plus loin sur l'extraction de données utiles, par exemple :

- intention du client
- niveau d'intérêt
- probabilité de commande
- produits mentionnés
- objections principales
- besoin de relance
- date idéale de rappel
- statut de décision
- dernier motif de non conversion

Sans cette structuration, l'IA reste surtout un assistant de confort.

## 5.6 Risque de réponses automatiques inadaptées

Le nœud `AI_REPLY` dans les FlowBots est puissant, mais il comporte des risques si mal utilisé :

- ton inadapté
- mauvaise compréhension du contexte
- promesse commerciale incorrecte
- réponse hors politique interne
- relance trop agressive
- confusion entre support, vente et recouvrement

Il faut éviter que l'IA prenne seule des décisions sensibles.

Il faut aussi éviter une activation globale trop large. Le fait qu'un fournisseur IA soit configuré ne doit jamais signifier que tous les scénarios peuvent utiliser l'IA automatiquement.

## 5.7 Peu d'usage IA côté admin et pilotage

Le panneau admin semble gérer surtout :

- la configuration
- l'automatisation
- certaines vues de supervision

Mais on ne voit pas encore d'usage IA solide pour :

- analyse qualité des commerciaux
- synthèse de performance
- détection de dérive
- coaching managérial
- analyse des motifs d'échec commerciaux
- revue automatique des conversations à risque

## 6. Ce qui est bon, mauvais ou à éviter selon les contextes

## 6.1 Contexte commercial en direct

### Ce qui est bon

- correction orthographique et reformulation
- suggestions de réponses courtes
- résumé rapide avant reprise de conversation
- aide au ton professionnel

### Ce qui est mauvais si on en abuse

- laisser l'IA répondre à la place du commercial sans contrôle
- proposer des réponses génériques non adaptées au produit ou au contexte
- donner au commercial des suggestions sans objectif métier clair

### Amélioration recommandée

Transformer les suggestions actuelles en suggestions orientées vente :

- réponse pour découverte du besoin
- réponse pour traitement d'objection
- réponse pour prise de coordonnées
- réponse pour transformation en appel
- réponse pour confirmation de commande
- réponse pour relance

Autrement dit : moins de texte générique, plus de suggestions guidées par étape commerciale.

## 6.2 Contexte de qualification de conversation

### Ce qui est bon

- résumé IA
- sentiment global

### Ce qui manque

- détection d'intention de commande
- qualification automatique de résultat
- proposition de statut final de conversation
- proposition de date de relance
- détection du motif de non conversion

### Amélioration recommandée

L'IA devrait produire une qualification structurée après chaque échange significatif :

- statut proposé
- résultat proposé
- besoin de rappel oui/non
- date de relance proposée
- urgence
- niveau de confiance
- probabilité de conversion
- commentaire explicatif

Le commercial ou le superviseur valide ensuite.

## 6.3 Contexte de suivi client de type bancaire

C'est le point le plus important pour votre besoin métier.

Aujourd'hui, l'IA existante n'est pas encore orientée dossier client.

### Ce qu'il faut viser

Pour chaque client, l'IA devrait aider à construire un dossier vivant avec :

- résumé global du profil
- historique des interactions
- historique des décisions
- historique des commandes
- fréquence des achats
- niveau de fiabilité
- préférences connues
- objections récurrentes
- incidents connus
- potentiel commercial
- prochaine meilleure action recommandée

### Ce qu'il faut éviter

- laisser l'IA certifier seule un compte client
- laisser l'IA décider seule de la valeur d'un client
- laisser l'IA remplacer les règles de conformité

L'IA doit assister la décision, pas remplacer la source de vérité.

## 6.4 Contexte relance client

### Très bon cas d'usage

L'IA peut être très utile pour :

- proposer le meilleur message de relance
- adapter le ton selon l'historique
- éviter les relances trop rapprochées
- suggérer le bon moment de rappel
- différencier relance vente, relance confirmation, relance après annulation, relance après livraison

### Amélioration recommandée

Créer un moteur de relance assisté par IA mais borné par des règles métier :

- fréquence maximale
- scénarios autorisés
- validation humaine selon le cas
- exclusion de certains profils
- templates approuvés

## 6.5 Contexte management et classement des commerciaux

### Bon usage possible

L'IA peut aider à produire :

- synthèse hebdomadaire par commercial
- qualité de communication
- taux de reformulation nécessaire
- respect des statuts de conversation
- détection des conversations mal clôturées
- détection des relances oubliées

### Mauvais usage à éviter

- noter automatiquement un commercial sans critères explicables
- générer un classement opaque
- utiliser des scores IA non audités comme base unique de sanction

Il faut des critères vérifiables, traçables et compréhensibles.

## 6.6 Contexte automatisation FlowBot

### Ce qui est intéressant

- traiter les cas simples
- répondre hors horaires
- capter les premières informations
- orienter vers un commercial

### Ce qui est risqué

- automatiser des réponses sensibles
- négociation automatique
- réponse automatique sur des litiges
- message automatique sur une situation client délicate

Le bon usage est d'automatiser le simple, pas le critique.

## 7. Recommandations prioritaires d'amélioration

## 7.0 Règle générale de gouvernance

Tous les cas d'utilisation de l'IA dans la plateforme doivent être obligatoirement optionnels.

Cela signifie concrètement :

- aucun usage IA ne doit être imposé par défaut à toute la plateforme
- l'admin doit pouvoir décider dans l'interface d'administration quels modules ont le droit d'utiliser l'IA
- chaque fonctionnalité IA doit être activable ou désactivable séparément
- l'activation d'un module IA doit être indépendante de la simple présence d'une clé API ou d'un fournisseur configuré

Exemples de modules à piloter séparément :

- suggestions de réponses pour les commerciaux
- correction/réécriture de texte
- résumé IA de conversation
- réponse IA automatique dans les FlowBots
- qualification assistée de conversation
- relance assistée par IA
- synthèse IA de dossier client
- analyse qualité ou coaching commercial

En pratique, l'interface admin devrait proposer pour chaque cas d'usage :

- un statut activé/désactivé
- les rôles autorisés à l'utiliser
- les contextes dans lesquels l'usage est permis
- les limites de sécurité
- le mode de fallback si l'IA est indisponible

Cette règle doit s'appliquer partout, pas seulement aux FlowBots.

## 7.1 Priorité 1 : faire de l'IA un moteur de qualification structurée

C'est l'amélioration la plus rentable pour votre contexte.

A mettre en place :

- extraction d'intention
- statut proposé
- résultat proposé
- proposition de relance
- date de rappel proposée
- niveau d'intérêt
- objections détectées
- produits mentionnés

Sortie attendue :

- données structurées stockables dans le dossier client
- pas seulement du texte affiché à l'écran

## 7.2 Priorité 2 : connecter l'IA au suivi client complet

L'IA doit alimenter le futur dossier client avec :

- synthèse des échanges
- signaux comportementaux
- résumé après appel
- résumé après commande
- anomalies ou incohérences détectées
- action recommandée suivante

Cela permettrait de rapprocher la plateforme conversationnelle du niveau de suivi souhaité.

## 7.3 Priorité 3 : mettre une gouvernance forte sur l'usage IA

A ajouter rapidement :

- anonymisation ou masquage des données sensibles avant envoi externe
- journalisation des appels IA
- métriques de coût
- métriques de latence
- métriques de qualité
- règles de conservation des prompts/réponses
- politique claire pour les usages automatiques

## 7.4 Priorité 4 : spécialiser les prompts par contexte métier

Aujourd'hui, une IA générique donne souvent des réponses génériques.

Il faut des prompts distincts pour :

- découverte du besoin
- prise de commande
- relance
- objection prix
- objection confiance
- absence de réponse
- client déjà livré
- client ayant annulé
- client à forte valeur

## 7.5 Priorité 5 : introduire une validation humaine pour les actions sensibles

Doivent rester sous validation humaine :

- certification client
- changement de statut critique
- promesse commerciale exceptionnelle
- relance inhabituelle
- message sur litige
- message après forte insatisfaction

## 7.6 Priorité 6 : paramétrer chaque usage IA avec un cadre de génération strict

Quand un module a le droit d'utiliser l'IA, cela ne doit pas se limiter à un simple bouton on/off. L'admin doit pouvoir définir le cadre exact de génération.

Pour chaque usage IA, il faut prévoir des paramètres tels que :

- le contexte métier du message
- l'objectif attendu
- le ton autorisé
- le niveau de formalité
- les éléments obligatoires à mentionner
- les éléments interdits
- les types de promesses interdites
- les limites de longueur
- la langue
- le besoin ou non de validation humaine avant envoi

Exemple concret pour les FlowBots :

- dans le menu admin du FlowBot, l'admin décide si le module FlowBot a le droit d'utiliser l'IA ou non
- dans la création d'un flow conversationnel, l'administrateur ou le concepteur du flow décide si un message donné est statique ou généré par l'IA
- si le message est généré par l'IA, il faut obligatoirement définir son contexte, son ton et ses contraintes métier
- si ces paramètres ne sont pas définis, le nœud ne devrait pas pouvoir être activé

Exemples de contexte à définir :

- accueil initial
- qualification
- relance douce
- relance commerciale
- reprise après silence
- réponse hors horaires
- demande d'informations complémentaires

Exemples de ton à définir :

- professionnel
- commercial
- rassurant
- neutre
- direct
- empathique

Exemples de contraintes à définir :

- ne jamais promettre une livraison
- ne jamais confirmer une disponibilité stock sans source de vérité
- ne jamais annoncer un prix non validé
- ne jamais utiliser un ton agressif
- ne jamais insister après un refus explicite

Ce principe doit s'appliquer à tous les usages IA de la plateforme :

- messages auto
- suggestions agent
- relances
- résumés
- qualification
- coaching
- synthèses client

## 8. Cas d'usage IA à ajouter

Voici les usages les plus pertinents à ajouter sur cette plateforme.

### A. Assistant de qualification de fin de conversation

Proposer automatiquement :

- le résultat probable
- le statut final
- le besoin de relance
- la date idéale de relance
- le motif de non commande

### B. Résumé IA de dossier client

Pour chaque client :

- qui il est
- ce qu'il a déjà demandé
- ce qu'il a déjà commandé
- ce qu'il a refusé
- ses objections habituelles
- le dernier contact utile
- l'action recommandée

### C. Assistant de relance intelligente

Selon l'historique :

- relance douce
- relance commerciale
- relance après livraison
- relance après annulation
- relance pour réachat

Condition obligatoire :

- chaque scénario de relance doit être activable séparément depuis l'admin
- chaque scénario doit avoir ses propres règles, son ton, ses limites et ses interdictions

### D. Contrôle qualité commercial

Analyser :

- clarté
- politesse
- structure
- capacité à conclure
- capacité à proposer une prochaine étape
- respect des consignes commerciales

### E. Extraction automatique de données de commande

A partir des messages et de l'appel résumé :

- nom
- numéros
- localisation
- produit
- quantité
- contraintes de livraison
- confirmation de disponibilité

L'objectif n'est pas de remplacer la plateforme de commande, mais de préparer les informations.

### F. Détection des conversations à risque

Exemples :

- client très mécontent
- conversation abandonnée
- promesse non suivie
- relance oubliée
- client à fort potentiel non rappelé

## 9. Usages IA à éviter ou à supprimer

## 9.1 A éviter

- activer l'IA globalement sans contrôle fin par module
- utiliser le sentiment lexical comme base centrale de décision
- envoyer automatiquement des réponses IA sans garde-fous sur des cas sensibles
- créer des scores opaques pour juger les commerciaux
- confondre score heuristique et intelligence réelle
- multiplier les gadgets IA qui ne produisent aucune donnée exploitable

## 9.2 A réduire

- les usages IA purement cosmétiques sans impact métier
- les réponses génériques trop vagues
- les résumés non sauvegardés ou non réutilisés

## 9.3 A conserver

- correction de texte
- suggestions de réponses
- résumé de conversation
- architecture multi-provider
- fallback opérationnels
- traitement asynchrone pour les analyses non critiques

## 10. Feuille de route recommandée

## Phase 1 : consolidation de l'existant

- fiabiliser les suggestions IA
- fiabiliser la réécriture
- mesurer usage, coût, latence
- masquer les données sensibles
- rendre chaque cas d'usage IA optionnel et pilotable dans l'admin
- ajouter des paramètres de contexte, ton et contraintes pour chaque module IA
- distinguer clairement IA, automatisation et scoring métier

## Phase 2 : qualification structurée

- extraction de l'intention client
- proposition de statut
- proposition de résultat
- détection du besoin de relance
- proposition de date
- stockage structuré dans le dossier client

## Phase 3 : IA orientée suivi client

- résumé global par client
- prochaine meilleure action
- catégorisation assistée
- détection d'anomalies de suivi
- aide à la gestion du portefeuille commercial

## Phase 4 : IA de supervision

- coaching commercial
- synthèse de performance
- conversations à risque
- suivi qualité
- aide au classement managérial explicable

## 11. Conclusion

L'utilisation actuelle de l'IA dans la plateforme est techniquement prometteuse mais encore incomplète d'un point de vue métier. Le projet a déjà les bonnes briques de départ :

- assistance à l'écriture
- résumé conversationnel
- automatisation compatible IA
- architecture extensible

En revanche, pour répondre à vos objectifs réels, l'IA doit maintenant sortir d'un rôle d'assistant rédactionnel pour devenir un outil de structuration, de qualification, de relance et de suivi client.

La meilleure direction n'est pas d'ajouter de l'IA partout, mais de l'utiliser là où elle produit une valeur métier claire :

- transformer une conversation en données utiles
- aider le commercial à prendre la bonne prochaine action
- nourrir le dossier client
- sécuriser les relances
- aider le management à piloter sans opacité

En résumé :

- la base actuelle est bonne
- l'usage actuel est encore trop limité au confort de conversation
- la prochaine étape doit être une IA orientée dossier client, qualification structurée et suivi commercial
