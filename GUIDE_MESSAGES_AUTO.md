# Guide de configuration des Messages Auto — Panneau Admin

## Prérequis

Avant de toucher aux messages auto, ces éléments doivent déjà exister dans l'admin :

1. **Au moins un canal configuré** → menu latéral → groupe **Infrastructure** → **Canaux** → le canal doit être connecté (statut vert)
2. **Au moins un poste configuré** → groupe **Equipe & Postes** → **Postes** → créer un poste et lui assigner un commercial
3. **Le système de dispatch actif** → groupe **Dispatch & Queue** → **Dispatch** → vérifier que le dispatch est activé

---

## Étape 1 — Activer les messages auto globalement

**Navigation** : menu latéral → groupe **Dispatch & Queue** → clic sur **Dispatch**

Dans la page Dispatch, tu vois 3 onglets en haut : `File d'attente` | `Messages auto` | `Historique`

→ Clique sur l'onglet **Messages auto**

Tu vois un toggle "Messages auto activés". **Active-le** si ce n'est pas déjà fait. Tant qu'il est désactivé, aucun message auto ne partira quoi que tu configures.

---

## Étape 2 — Configurer le CRON global

**Navigation** : menu latéral → groupe **Dispatch & Queue** → **Dispatch** → onglet **Messages auto**

Tu es maintenant dans la vue `MessageAutoView`. Le premier onglet actif est **CRON Global**.

1. Dans la carte de configuration, clique sur l'icône **⚙️** (engrenage) à droite
2. Remplis les champs :
   - **Intervalle CRON** : `5` (toutes les 5 minutes le système vérifie)
   - **Délai min (s)** : `60` (fallback si le message n'a pas de délai propre)
   - **Délai max (s)** : `120`
   - **Étapes max** : `3`
3. Clique **Sauvegarder**
4. Active le toggle à droite de la carte → il devient vert

---

## Étape 3 — Créer un message auto (exemple : séquence de bienvenue)

**Navigation** : même page, clic sur l'onglet **B – Séquence**

1. Active le trigger avec le toggle → il passe vert
2. Clique sur le bouton **+ Nouveau** (en haut à droite de la liste)
3. Le formulaire de création s'ouvre. Remplis :
   - **Corps du message** : `Bonjour #name#, votre message est bien reçu. Un agent va vous prendre en charge sous peu.`
   - **Position** : `1`
   - **Délai (s)** : `60` ← le message partira 60 secondes après le message du client
   - **Type de scope** : `Global` (s'applique à toutes les conversations)
   - **Actif** : coché
4. Clique **Créer**

Pour ajouter un **2e message** dans la séquence :

1. Re-clique **+ Nouveau**
2. Corps : `Nous traitons votre demande, merci de patienter.`
3. Position : `2`
4. Délai : `300` (5 minutes après le 1er message)
5. Scope : `Global`
6. Clique **Créer**

---

## Étape 4 — Configurer un trigger spécifique (exemple : hors horaires)

**Navigation** : même page, clic sur l'onglet **C – Hors horaires**

1. Active le trigger avec le toggle
2. Clique sur **⚙️** → vérifie la plage horaire active si besoin
3. Descends dans la page → tu vois la section **Horaires d'ouverture**
4. Configure chaque jour (Lundi → Vendredi : 8h–18h, Samedi/Dimanche : fermé)
5. Clique **+ Nouveau** → Corps : `Bonjour #name#, nous sommes fermés. Nos horaires : 8h–18h du lundi au vendredi.` → Position : `1` → Délai : `0` → Créer

---

## Étape 5 — Restreindre un message à un canal/poste (scope)

Lors de la création ou modification d'un message, dans la section **Scope** :

- **Global** → s'applique à toutes les conversations (par défaut)
- **Poste spécifique** → sélectionne un poste dans le select → ce message ne partira que pour les conversations assignées à ce poste
- **Canal spécifique** → sélectionne un canal → ce message ne partira que pour les messages reçus sur ce canal

### Cas : exclure un canal du message global

Si tu as un message Global mais que tu ne veux pas qu'il parte sur un canal précis :

1. Laisse le scope sur **Global**
2. Dans la section **Exclusions** (visible uniquement en scope Global), utilise le select **"Ajouter un canal"** → sélectionne le canal → il apparaît en tag orange
3. Pour les postes : utilise le select **"Ajouter un poste"** de la même façon
4. Sauvegarde

---

## Étape 6 — Trigger par mot-clé (onglet F)

**Navigation** : onglet **F – Mot-clé**

1. Active le trigger
2. Crée le message (corps + délai + scope)
3. Une fois créé, dans la liste tu vois une icône **🏷️** sur la ligne du message → clique dessus
4. Un panneau s'ouvre → clique **+ Ajouter un mot-clé**
5. Entre le mot : `devis`, type : **Contient**, sensible à la casse : non → Ajouter
6. Répète pour `tarif`, `prix`

---

## Récapitulatif de navigation

```
Menu latéral
└── Dispatch & Queue
    └── Dispatch
        └── [onglet] Messages auto
            ├── CRON Global       ← configurer en premier, activer
            ├── A – Sans réponse  ← activer + seuil en minutes
            ├── B – Séquence      ← messages de bienvenue / relance
            ├── C – Hors horaires ← activer + configurer horaires en bas
            ├── D – Réouverture
            ├── E – File d'attente ← seuil en minutes
            ├── F – Mot-clé       ← créer message + ajouter mots-clés via 🏷️
            ├── G – Type client
            ├── H – Inactivité    ← seuil en minutes
            └── I – Assignation
```

---

## Règles de priorité des scopes

Quand un message arrive, le système cherche dans cet ordre :

1. Message scopé sur le **poste** de la conversation → utilisé en priorité
2. Message scopé sur le **canal** de la conversation → priorité si pas de scope poste
3. Message **global** → fallback, sauf si le canal/poste est dans les exclusions

---

## Règle de priorité des délais

Pour chaque message envoyé, le délai est choisi dans cet ordre :

1. **Délai du message** (champ "Délai (s)" rempli lors de la création) → priorité absolue
2. **Délai global** (Délai min/max configuré dans CRON Global) → utilisé si le message n'a pas de délai
3. **Fallback** : 300–540 secondes aléatoire si rien n'est configuré nulle part

> Conseil : toujours remplir le champ Délai sur chaque message pour avoir un comportement prévisible.

---

## Placeholders disponibles dans les messages

| Placeholder | Valeur remplacée |
|---|---|
| `#name#` | Prénom / nom du client |
| `#numero#` | Numéro de téléphone du client |
