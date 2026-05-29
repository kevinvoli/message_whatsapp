# Rapport - Processus de blocage/deblocage d'un poste

Date : 2026-05-29

## Synthese

Le processus de blocage/deblocage repose sur deux etats differents :

- `whatsapp_poste.is_queue_enabled` : autorise ou interdit le poste dans la queue pool.
- `queue_positions` : presence effective du poste dans la file de dispatch.

Le blocage via l'endpoint `/queue/block/:posteId` est globalement coherent pour retirer le poste de la queue.

Le deblocage via `/queue/unblock/:posteId` contient en revanche un bug confirme : si le poste est offline (`is_active = false`), il repasse bien en `is_queue_enabled = true`, mais il n'est pas reinsere dans `queue_positions`. Il ne revient donc pas dans le pool offline tant qu'un commercial du poste ne se connecte pas ou qu'un autre mecanisme ne reconstruit la queue.

Il existe aussi une incoherence secondaire : l'endpoint generique `PATCH /poste/:id` peut modifier `is_queue_enabled` sans synchroniser `queue_positions`, contrairement aux endpoints dedies `/queue/block` et `/queue/unblock`.

## Endpoints concernes

### Blocage

Fichier : `message_whatsapp/src/dispatcher/dispatcher.controller.ts`

Route :

```ts
@Post('block/:posteId')
async blockPoste(@Param('posteId') posteId: string) {
  await this.queueService.blockPoste(posteId);
  this.gateway.emitQueueUpdatePublic('admin_block');
  return { success: true };
}
```

Effet attendu :

1. Desactiver le poste pour la queue.
2. Le retirer de `queue_positions`.
3. Notifier le front via `queue:updated`.

### Deblocage

Fichier : `message_whatsapp/src/dispatcher/dispatcher.controller.ts`

Route :

```ts
@Post('unblock/:posteId')
async unblockPoste(@Param('posteId') posteId: string) {
  await this.queueService.unblockPoste(posteId);
  this.gateway.emitQueueUpdatePublic('admin_unblock');
  return { success: true };
}
```

Effet attendu :

1. Reactiver le poste pour la queue.
2. Le reinserer dans la queue si le contexte le permet.
3. Notifier le front.

## Processus reel dans `QueueService`

### Ajout dans la queue

Fichier : `message_whatsapp/src/dispatcher/services/queue.service.ts`

`addPosteToQueueInternal(posteId)` :

- charge le poste ;
- refuse si `is_queue_enabled = false` ;
- refuse si le poste a un canal dedie ;
- evite les doublons dans `queue_positions` ;
- ajoute le poste en fin de queue.

Important : cette methode ne verifie pas `is_active`. C'est volontaire dans ce code, car la queue peut fonctionner en mode offline quand aucun agent n'est connecte.

### Blocage

Code actuel :

```ts
async blockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: false });
    await this.removeFromQueueInternal(posteId);
    this.logQueueEvent('block', { poste_id: posteId });
  });
}
```

Comportement :

- `is_queue_enabled` passe a `false`.
- Le poste est retire de `queue_positions`.
- Les positions restantes sont compactees par `removeFromQueueInternal`.

Conclusion : le blocage fonctionne pour empecher les nouveaux dispatchs via la queue.

Limite : le blocage ne force pas `is_active = false`. Si un commercial est deja connecte, le poste peut rester `is_active = true` tout en etant bloque dans la queue. Ce n'est pas forcement un bug si "bloquer" signifie seulement "retirer du pool", mais c'est incoherent avec `WhatsappPosteService.update()`, qui interdit un poste actif avec `is_queue_enabled = false`.

### Deblocage

Code actuel :

```ts
async unblockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: true });
    const poste = await this.posteRepository.findOne({
      where: { id: posteId },
    });
    if (poste?.is_active) {
      await this.addPosteToQueueInternal(posteId);
    }
    this.logQueueEvent('unblock', { poste_id: posteId });
  });
}
```

Comportement :

- `is_queue_enabled` passe a `true`.
- Le poste est ajoute a `queue_positions` uniquement si `is_active = true`.
- Si le poste est offline, rien ne l'ajoute a la queue.

Conclusion : bug confirme pour le deblocage d'un poste offline.

## Interaction avec connexion/deconnexion commercial

Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

### Connexion

Quand un commercial se connecte :

1. Le poste passe `is_active = true`.
2. Si `is_queue_enabled = true` et poste non dedie :
   - `purgeOfflinePostes(posteId)` retire les autres postes offline de la queue.
   - `addPosteToQueue(posteId)` ajoute le poste connecte.
3. `startAgentSlaMonitor(posteId)` lance une verification SLA immediate.

C'est pour cela qu'un poste debloque offline "revient a la normale" quand un commercial de ce poste se connecte.

### Deconnexion

Quand le dernier commercial d'un poste se deconnecte :

1. Le poste passe `is_active = false`.
2. Le poste est retire de `queue_positions`.
3. Si la queue devient vide, `fillQueueWithAllPostes()` remet tous les postes non bloques avec commerciaux dans la queue, pour le mode offline.

Ce comportement est coherent avec le mode offline.

## Interaction avec le SLA checker

Fichier : `message_whatsapp/src/dispatcher/dispatcher.service.ts`

`jobRunnerAllPostes()` lit les postes presents dans `queue_positions`.

Il detecte aussi les conversations non lues sur des postes hors queue via :

```ts
chat.poste_id NOT IN (:...posteIds)
```

Mais il ne traite que les conversations avec :

```ts
chat.unread_count > 0
chat.last_client_message_at < threshold
```

Donc un poste debloque mais absent de la queue peut etre partiellement rattrape par le SLA checker, mais seulement si les conversations ont depasse le seuil. Ce n'est pas equivalent a une reinsertion correcte du poste dans la queue.

## Bug principal confirme

### Bug : deblocage offline incomplet

Scenario :

1. Poste X est bloque.
2. `is_queue_enabled = false`.
3. Poste X est retire de `queue_positions`.
4. Aucun commercial du poste X n'est connecte, donc `is_active = false`.
5. Admin debloque le poste X.
6. `is_queue_enabled = true`.
7. `unblockPoste()` ne l'ajoute pas a `queue_positions` car `poste.is_active = false`.
8. Le poste reste absent de la queue.

Impact :

- Le poste est marque comme autorise, mais n'est pas effectivement disponible dans la queue.
- Le dispatch offline ne le considere pas comme destination normale.
- Le retour a la normale depend d'un evenement externe : connexion d'un commercial, reconstruction de queue, ou cron SLA selon eligibility.

Severite : haute, car l'etat DB devient incoherent avec l'intention admin.

## Bug secondaire confirme

### Bug : `PATCH /poste/:id` peut desynchroniser la queue

Fichier : `message_whatsapp/src/whatsapp_poste/whatsapp_poste.service.ts`

`update()` peut modifier `is_queue_enabled`, mais ne retire ni n'ajoute le poste dans `queue_positions`.

Exemple :

- Si `PATCH /poste/:id` met `is_queue_enabled = false`, le poste est sauvegarde comme bloque, mais il peut rester dans `queue_positions`.
- `getNextInQueue()` ne filtre pas `is_queue_enabled` sur les positions existantes ; il prend les postes presents dans la queue et exclut seulement les postes dedies.
- Un poste bloque mais reste dans `queue_positions` pourrait donc encore etre choisi comme destination de dispatch.

Severite : moyenne a haute, selon que le front/admin utilise encore `PATCH /poste/:id` pour bloquer/debloquer.

## Incoherence de modele

Deux interpretations existent dans le code :

1. Dans `QueueService.blockPoste()`, bloquer un poste signifie seulement le retirer de la queue. Le poste peut rester actif.
2. Dans `WhatsappPosteService.update()`, un poste bloque ne doit pas etre actif :

```ts
if (nextQueueEnabled === false && nextIsActive) {
  throw new BadRequestException(
    "Ce poste est bloque dans la file. Debloquez-le avant de l'activer.",
  );
}
```

Il faut clarifier la regle metier :

- soit "bloque" = exclu du dispatch pool mais le commercial peut rester connecte ;
- soit "bloque" = poste non actif et hors queue.

Aujourd'hui, les deux chemins ne respectent pas la meme definition.

## Correction recommandee

### 1. Centraliser le changement de statut queue

Eviter que `WhatsappPosteService.update()` modifie directement `is_queue_enabled` sans passer par `QueueService`.

Approche recommandee :

- si `is_queue_enabled` change vers `false`, appeler `queueService.blockPoste(id)`;
- si `is_queue_enabled` change vers `true`, appeler `queueService.unblockPoste(id)`;
- ou retirer `is_queue_enabled` du DTO generique `PATCH /poste/:id` et forcer l'utilisation de `/queue/block` et `/queue/unblock`.

### 2. Corriger `unblockPoste()`

Le fix depend de la regle metier retenue.

Option prudente :

- si le poste est actif, l'ajouter directement ;
- si aucun poste pool actif n'existe, reconstruire la queue offline avec `fillQueueWithAllPostes()` ;
- si d'autres postes actifs existent, ne pas ajouter le poste offline pour eviter qu'il recoive des conversations alors que des agents sont connectes.

Pseudo-code :

```ts
async unblockPoste(posteId: string): Promise<void> {
  await this.queueLock.runExclusive(async () => {
    await this.posteRepository.update(posteId, { is_queue_enabled: true });

    const poste = await this.posteRepository.findOne({ where: { id: posteId } });
    if (poste?.is_active) {
      await this.addPosteToQueueInternal(posteId);
    } else {
      const hasActivePoolPostes = await this.hasActivePostes();
      if (!hasActivePoolPostes) {
        // Attention : fillQueueWithAllPostes prend deja le lock aujourd'hui.
        // Il faudrait extraire une version internal sans relock pour eviter un deadlock.
        await this.fillQueueWithAllPostesInternal();
      }
    }

    this.logQueueEvent('unblock', { poste_id: posteId });
  });
}
```

Important : ne pas appeler `fillQueueWithAllPostes()` directement depuis `queueLock.runExclusive`, car cette methode prend deja le meme lock. Il faut extraire une methode interne sans lock.

### 3. Ajouter des tests

Tests prioritaires :

- `blockPoste()` met `is_queue_enabled = false` et supprime la position de queue.
- `unblockPoste()` avec poste actif ajoute le poste a la queue.
- `unblockPoste()` avec poste offline et aucune queue active remet le poste dans la queue offline.
- `PATCH /poste/:id` ne doit pas pouvoir laisser un poste bloque dans `queue_positions`.
- `getNextInQueue()` ne doit jamais retourner un poste `is_queue_enabled = false`, meme si une ligne incoherente existe dans `queue_positions`.

## Conclusion

Oui, il y a un bug dans le processus de deblocage : un poste offline debloque ne revient pas automatiquement dans la queue.

Il y a aussi un risque plus large de desynchronisation, car `is_queue_enabled` peut etre modifie hors `QueueService`. Le systeme devrait avoir une seule porte d'entree pour bloquer/debloquer un poste, ou au minimum une garde dans `getNextInQueue()` pour ne jamais selectionner un poste bloque reste par erreur dans `queue_positions`.
