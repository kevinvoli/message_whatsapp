# Fonctionnalités récentes — Vue d'ensemble

**Date de génération :** 2026-05-27  
**Source :** Plans d'implémentation du projet

---

## Canaux & Dispatch

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 1 | **Isolation canaux dédiés** | Séparation des contextes pool/dédié pour éviter le mélange des conversations |
| 2 | **Exclusion postes dédiés des règles** | Rate limit, cooldown et idle disconnect désactivés pour les postes dédiés |
| 3 | **Séparation admin canaux dédiés** | Vue admin distincte pour les KPIs et commerciaux des postes dédiés |

---

## Commerciaux — Activité & Connexion

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 4 | **Lecture messages & inactivité** | Tracking des messages lus + déconnexion automatique après inactivité configurable |
| 5 | **Cooldown & masquage numéros** | Limite de lecture configurable (0–36000s) + masquage des numéros clients sur sidebar dédiée |
| 6 | **Temps de connexion commerciaux** | Calcul fiable du temps de connexion (sessions correctement fermées, intersection de période) affiché dans les stats admin et le panneau "Mon activité" commercial avec filtre période |

---

## Dashboard Admin — KPIs & Métriques

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 7 | **Dashboard admin** | Filtre date personnalisé, KPIs conversations, heures de connexion commerciaux |
| 8 | **Métriques messages V2** | Taux de réponse basé sur les tours de conversation (1 message client = 1 traité) |
| 9 | **Statistiques conversations commercial** | KPIs reçues / répondues / traitées par commercial avec taux de réponse et taux de traitement |
| 10 | **Trafic messages** | Onglet admin avec diagramme horaire des messages entrants/sortants + 8 KPIs |
| 11 | **Trafic messages V2** | Ajout onglet Conversations (actives/fermées/en attente) symétrique au trafic messages |

---

## Front Commercial — UX

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 12 | **Badges → Filtres cliquables** | Les badges de statut (non lus, nouveau) deviennent des boutons de filtre dans la vue conversations |
| 13 | **Persistance navigation** | Le filtre et la vue active sont sauvegardés dans l'URL — pas de reset au refresh |
| 14 | **Mode lecture seule paramétrable** | Contrôle fin (par canal) de quand un commercial peut/ne peut plus écrire |

---

## Campagnes & Médias

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 15 | **Liens de campagne** | Génération d'URLs click-to-chat avec tracking clics, conversions et attribution auto |
| 16 | **Médias dans liens campagne** | Médiathèque centralisée pour insérer images/vidéos dans les messages de campagne |

---

## Appels

| # | Fonctionnalité | Ce que ça fait |
|---|---------------|----------------|
| 17 | **Fonctionnalités appels** | Auto-reply sur appels manqués + appels internes commerciaux via WebRTC |

---

## Corrections & Alignements

| # | Correction | Ce que ça fixe |
|---|-----------|----------------|
| 18 | **Alignement "non lus"** | Critère unifié EXISTS sur messages sent/delivered dans tout le projet |
| 19 | **Filtre "converti" & "nouveau"** | Exclusion du statut converti des badges + filtre nouveau côté serveur |
| 20 | **Scroll infini onglets** | Stabilisation de l'observer pour éviter la cascade de rechargements |
| 21 | **Correction unread + filtres** | Alignement requêtes non lus, fallback date, bug scroll lors du filtrage |
| 22 | **Note exclusion rate limit lecture** | Clarification UI que les postes dédiés ignorent le rate limit de lecture |
