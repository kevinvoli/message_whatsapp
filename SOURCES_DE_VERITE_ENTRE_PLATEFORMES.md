# Sources De Verite Entre La Plateforme Conversationnelle Et La Plateforme De Gestion Des Commandes

Date: 20 avril 2026

## 1. Objet du document

Ce document contient uniquement les differentes sources de verite entre:
- la plateforme conversationnelle
- la plateforme de gestion des commandes

Il ne decrit pas les webhooks, ni les payloads, ni les echanges en detail.

Son objectif est simple:
- dire quelle plateforme est maitre de quelle donnee

---

## 2. Regle generale

Une donnee ne doit avoir qu'une seule source de verite principale.

Cela signifie:
- une plateforme cree et maitrise la donnee
- l'autre plateforme peut la consulter, l'afficher ou en recevoir une copie
- mais l'autre plateforme ne doit pas devenir la reference principale de cette donnee

---

## 3. Sources de verite cote plateforme conversationnelle

La plateforme conversationnelle est la source de verite principale pour les donnees suivantes.

## 3.1. Conversation

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- conversation
- statut de conversation
- resultat de conversation
- date d'ouverture
- date de cloture
- conversation active ou non
- conversations grisees ou debloquees
- nombre de conversations actives par commercial

## 3.2. Historique des messages

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- messages entrants
- messages sortants
- historique complet des echanges
- horodatage des messages
- auteur du message
- canal de provenance du message

## 3.3. Qualification commerciale

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- niveau d'interet du client
- objections du client
- besoin exprime
- priorite commerciale
- notes commerciales
- resume de qualification
- date souhaitée de rappel
- souhait de relance

## 3.4. Relances et rappels commerciaux

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- relances planifiees
- relances effectuees
- rappels programmes
- resultat des relances
- date de prochaine relance

## 3.5. Portefeuille commercial

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- attribution des clients aux commerciaux
- portefeuille client du commercial
- suivi relationnel par commercial

## 3.6. Messages automatiques

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- scenarios automatiques
- messages automatiques envoyes
- statut des messages automatiques
- historique des automatismes

## 3.7. Historique relationnel de conversation

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- qui a parle au client par messagerie
- quand
- sur quel canal
- avec quel resultat conversationnel

## 3.8. Regles de gestion de charge conversationnelle

Source de verite:
- plateforme conversationnelle

Donnees concernees:
- limite de conversations par commercial
- nombre de conversations visibles
- nombre de conversations actives
- criteres de deblocage

---

## 4. Sources de verite cote plateforme de gestion des commandes

La plateforme de gestion des commandes est la source de verite principale pour les donnees suivantes.

## 4.1. Commande

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- creation de commande
- numero de commande
- details de commande
- lignes de commande
- quantites
- produits commandes
- prix
- remises
- frais de livraison
- total de commande

## 4.2. Statut de commande

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- commande en attente
- commande confirmee
- commande en preparation
- commande prete
- commande annulee
- commande retournee

## 4.3. Livraison

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- planification de livraison
- statut de livraison
- date de livraison
- resultat de livraison
- echec de livraison
- preuve de livraison

## 4.4. Historique logistique

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- suivi logistique de la commande
- etapes de traitement de la commande
- affectation livraison

## 4.5. Aggregats de commande du client

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- nombre total de commandes
- nombre total de livraisons
- nombre total d'annulations
- chiffre d'affaires client
- date de premiere commande
- date de derniere commande
- date de derniere livraison

## 4.6. Categorie client basee sur l'historique de commande

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- client ayant passe commande et jamais livre
- client ayant passe commande et livre au moins une fois
- client n'ayant jamais commande
- client ayant passe commande puis annule

Remarque:
- cette categorie peut etre affichee dans la plateforme conversationnelle
- mais la reference principale reste la plateforme de gestion des commandes

## 4.7. Certification client

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- statut de certification
- niveau de verification
- telephone verifie
- identite verifiee
- statut de validation

## 4.8. Parrainage

Source de verite:
- plateforme de gestion des commandes

Donnees concernees:
- lien de parrainage
- statut du parrainage
- recompense
- validation des avantages

---

## 5. Sources de verite partagees avec maitre principal defini

Certaines donnees existent dans les deux plateformes mais une seule reste la reference principale.

## 5.1. Fiche client

Source de verite principale:
- partagee selon le type de donnee

Repartition recommandee:
- identite conversationnelle et informations de qualification: plateforme conversationnelle
- historique de commande, livraison et certification: plateforme de gestion des commandes

## 5.2. Identite client

Source de verite pratique:
- corrélation principale par numero de telephone

Reference metier recommandee:
- le rattachement inter-plateformes se fait par le numero de telephone

Remarque:
- un client peut avoir plusieurs numeros
- il faut donc maintenir un mapping multi-numeros

## 5.3. Identite commerciale

Source de verite pratique:
- corrélation principale par numero de telephone du commercial

Repartition recommandee:
- presence conversationnelle, charge, conversations traitees: plateforme conversationnelle
- eventuelles informations internes a la prise de commande: plateforme de gestion des commandes

---

## 6. Cas particuliers

## 6.1. Appels telephoniques

Cas actuel:
- l'application sur les telephones de l'entreprise communique deja avec la plateforme de gestion des commandes

Conclusion:
- la preuve brute qu'un appel a eu lieu depend de l'ecosysteme telephonique deja connecte a la plateforme de gestion des commandes
- la plateforme conversationnelle reste source de verite sur le contexte commercial de cet appel si elle le rattache a une conversation ou a une relance

Repartition recommandee:
- trace technique de l'appel: plateforme de gestion des commandes
- interpretation commerciale de l'appel: plateforme conversationnelle

## 6.2. Dashboard technique serveur et applications

Source de verite recommandee:
- systeme de supervision ou plateforme technique dediee

En attendant:
- si ces donnees sont centralisees dans la plateforme de gestion, elle peut en etre la source de verite

Mais idealement:
- ni la plateforme conversationnelle
- ni la plateforme de gestion des commandes
ne devraient etre seules sources de verite pour les metriques techniques serveur

---

## 7. Resume tres court

### Source de verite plateforme conversationnelle
- conversations
- messages
- qualification commerciale
- relances
- rappels
- portefeuille commercial
- messages automatiques
- regles de charge conversationnelle

### Source de verite plateforme de gestion des commandes
- commandes
- statuts de commande
- livraisons
- annulations
- historique logistique
- aggregats de commandes
- categorie client basee sur la commande
- certification client
- parrainage

### Correlation entre plateformes
- client: par numero de telephone
- commercial: par numero de telephone du commercial

