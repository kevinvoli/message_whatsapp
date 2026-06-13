# Plan de correction — Messages vocaux sans son

> Date : 2026-06-13  
> Statut : PLAN — non implémenté

---

## Diagnostic

### Bug A — Vocal commercial → client : arrive sans son

**Chaîne d'envoi** :
```
ChatInput (MediaRecorder WebM) → POST /messages/media
  → CommunicationMetaService.sendMediaMessage
  → transcodeWebmToOgg (ffmpeg spawn)
  → Meta API (audio/ogg)
  → Client WhatsApp
```

**Cause 1 — ffmpeg absent ou mal installé sur le serveur** :  
`spawn('ffmpeg', ...)` lève une erreur silencieuse →
`WhapiOutboundError` permanent 415 → le fichier n'est jamais envoyé.
Le commercial peut ne pas voir l'erreur si l'UI absorbe le 422.

**⚠️ À vérifier EN PREMIER avant toute implémentation** :
```bash
docker exec whatsapp-back ffmpeg -version
```
- Si la commande échoue → ffmpeg absent → ajouter au Dockerfile (voir P0-A)
- Si ffmpeg est présent → passer directement aux args (voir P0-A étape 2)

**Cause 2 — arguments ffmpeg insuffisants** :  
Arguments actuels dans `communication_meta.service.ts:440` :
```bash
ffmpeg -i pipe:0 -f ogg -acodec libopus -vn pipe:1
```
Il manque `-ar 48000` (fréquence d'échantillonnage cible de WhatsApp)
et `-b:a 64k` (bitrate recommandé). Un fichier OGG/Opus hors spec
peut être accepté par Meta mais délivré muet au destinataire.

**Cause 3 — buffer post-transcode jamais validé** :  
Si ffmpeg produit 0 octets (panic silencieux), le buffer vide est
envoyé à Meta sans erreur visible. Aucune vérification de taille
n'existe dans le code actuel.

**Cause 4 — canal Whapi** :  
Si le canal utilise Whapi (pas Meta), `CommunicationWhapiService`
est appelé → sans transcoding. Le WebM brut est envoyé à Whapi
qui gère sa propre conversion. À vérifier séparément si le bug
concerne aussi les canaux Whapi.

---

### Bug B — Vocal client → commercial : son uniquement après téléchargement

**Chaîne de lecture** :
```
Webhook Meta → MediaDownloadService → stockage /uploads/media/*.ogg
  → ChatMessage <audio src="/uploads/media/*.ogg">
  → Express serve-static → navigateur
```

**Cause principale — Content-Type incorrect** :  
Express `serve-static` détermine le `Content-Type` par l'extension
du fichier. Sur Linux (Docker), `.ogg` est souvent mappé à
`application/ogg` (MIME générique) au lieu de `audio/ogg`.
Chrome refuse de lire `application/ogg` inline dans `<audio>`.

**Cause secondaire — absence de Range requests via le redirect** :  
Quand `media.local_url` existe, le contrôleur fait un **redirect 302**
vers `/uploads/media/...`. Ce redirect contourne le handler Range
manuel du contrôleur (lignes 758-775). Chrome `<audio>` nécessite
`Accept-Ranges: bytes` + réponses `206 Partial Content` pour démarrer
la lecture sans tout télécharger.

**Preuve** : le son fonctionne après téléchargement car le lecteur
OS gère `application/ogg` nativement, indépendamment du Content-Type.

---

## Plan de corrections

### P0-A — Vérifier et corriger le transcode ffmpeg

**Fichier** : `message_whatsapp/src/communication_whapi/communication_meta.service.ts`

**Étape 1 — Vérifier ffmpeg sur le serveur** :
```bash
docker exec whatsapp-back ffmpeg -version
```
Si absent → ajouter au Dockerfile :
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

**Étape 2 — Améliorer les arguments ffmpeg** (ligne ~440) :

```typescript
// Avant
const ffmpeg = spawn('ffmpeg', [
  '-i', 'pipe:0',
  '-f', 'ogg',
  '-acodec', 'libopus',
  '-vn',
  'pipe:1',
]);

// Après
const ffmpeg = spawn('ffmpeg', [
  '-i', 'pipe:0',
  '-ar', '48000',      // fréquence d'échantillonnage WhatsApp
  '-b:a', '64k',       // bitrate recommandé pour la voix
  '-f', 'ogg',
  '-acodec', 'libopus',
  '-vn',
  'pipe:1',
]);
```

**Étape 3 — Valider la taille du buffer post-transcode** :

```typescript
ffmpeg.on('close', (code) => {
  const output = Buffer.concat(chunks);
  if (code === 0 && output.length >= 512) {
    resolve(output);
  } else {
    reject(
      new Error(
        `ffmpeg exit=${code ?? 'null'} output_size=${output.length}B stderr=${stderr.slice(0, 500)}`,
      ),
    );
  }
});
```

> Le seuil de 512 octets détecte les fichiers vides ou corrompus.
> Si le buffer est trop petit, l'erreur est remontée comme `WhapiOutboundError`
> et loguée avec le stderr ffmpeg complet pour faciliter le diagnostic.

---

### P0-B — Corriger la lecture inline des audios clients (Bug B)

**Approche** : supprimer le redirect 302 → streamer directement via
une méthode privée partagée avec `Content-Type` explicite et support
Range complet.

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts`

#### Étape 1 — Créer une méthode privée `streamLocalMedia`

Extraire le streaming dans une méthode réutilisable pour éviter la
duplication dans les 3 blocs (meta ~434, whapi ~552, messenger ~626) :

```typescript
private streamLocalMedia(
  localPath: string,
  mimeType: string,
  req: Request,
  res: Response,
): void {
  const absolutePath = path.join(process.cwd(), localPath);
  const stat = fs.statSync(absolutePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers['range'] as string | undefined;

  // Content-Type explicite indépendant de l'extension
  const contentType = mimeType.startsWith('audio/ogg')
    ? 'audio/ogg; codecs=opus'
    : mimeType || 'application/octet-stream';

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Content-Type': contentType,
    });
    fs.createReadStream(absolutePath, { start, end }).pipe(res);
  } else {
    res.status(200).set({
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
    });
    fs.createReadStream(absolutePath).pipe(res);
  }
}
```

#### Étape 2 — Remplacer les 3 redirects par `streamLocalMedia`

Dans chacun des 3 blocs (meta, whapi, messenger), remplacer :

```typescript
// Avant (dans les 3 blocs)
if (media.localUrl && media.localPath) {
  const exists = fs.existsSync(media.localPath);
  if (exists) {
    return res.redirect(302, media.localUrl);  // ← supprimer
  }
  // ...
}

// Après (dans les 3 blocs)
if (media.localUrl && media.localPath) {
  const absolutePath = path.join(process.cwd(), media.localPath);
  if (fs.existsSync(absolutePath)) {
    const mimeType = media.mimeType ?? 'application/octet-stream';
    return this.streamLocalMedia(media.localPath, mimeType, req, res);
  }
  // Invalider si le fichier a disparu du disque
  await this.mediaRepository.update(media.id, {
    localUrl: null,
    localPath: null,
  });
}
```

> `media.mimeType` doit être accessible sur l'entité `WhatsappMedia`.
> Vérifier que la colonne existe — si non, utiliser l'extension du fichier
> comme fallback pour construire le Content-Type.

---

### P1 — Conversion OGG → MP3 à la réception (iOS Safari uniquement)

**Périmètre** : cette correction est **nécessaire uniquement si les
commerciaux utilisent iOS Safari**. Chrome, Firefox et Edge supportent
nativement OGG/Opus — P0-B suffit pour ces navigateurs.

**Si les agents n'utilisent pas iOS Safari → P1 peut être ignoré.**

**Si iOS Safari est requis** : ajouter dans `MediaDownloadService`,
après le téléchargement du buffer, une conversion OGG → MP3 :

```typescript
// Après récupération du buffer depuis le provider
if (mimeType.startsWith('audio/ogg') || mimeType.startsWith('audio/opus')) {
  buffer = await this.transcodeOggToMp3(buffer);
  mimeType = 'audio/mpeg';
  fileExtension = '.mp3';
}

// Méthode de transcode
private async transcodeOggToMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-ar', '44100',
      '-b:a', '128k',
      '-f', 'mp3',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    ffmpeg.on('close', (code) => {
      const output = Buffer.concat(chunks);
      if (code === 0 && output.length >= 512) {
        resolve(output);
      } else {
        // En cas d'échec → retourner l'OGG original pour ne pas bloquer
        this.logger.warn(
          `OGG→MP3 transcode failed (exit=${code}, size=${output.length}B), keeping original`,
          MediaDownloadService.name,
        );
        resolve(input);
      }
    });
    ffmpeg.stdin.end(input);
  });
}
```

> En cas d'échec du transcode, le fichier OGG original est conservé
> (fallback non bloquant) — le commercial peut toujours télécharger.

---

## Fichiers à modifier (récapitulatif)

| Priorité | Fichier | Changement |
|---|---|---|
| P0-A (si ffmpeg absent) | `Dockerfile` backend | `apt-get install -y ffmpeg` |
| P0-A | `communication_whapi/communication_meta.service.ts:440` | Args ffmpeg + validation taille buffer |
| P0-B | `whatsapp_message/whatsapp_message.controller.ts` | Méthode `streamLocalMedia` + suppression des 3 redirects |
| P1 (iOS Safari uniquement) | `media-storage/media-download.service.ts` | Transcode OGG → MP3 à la réception |

---

## Ordre d'exécution recommandé

```
1. docker exec whatsapp-back ffmpeg -version
   → Si absent : corriger Dockerfile + redéployer avant tout
   → Si présent : passer directement à l'étape 2

2. Implémenter P0-A (args ffmpeg + validation buffer)
   → Tester : envoyer un vocal depuis le front commercial
   → Vérifier les logs : aucun "ffmpeg exit=" dans les ERRORs

3. Implémenter P0-B (streamLocalMedia)
   → Tester : recevoir un vocal client
   → DevTools Network : vérifier 206 Partial Content + Content-Type: audio/ogg; codecs=opus
   → Vérifier lecture inline sans téléchargement

4. P1 si et seulement si les agents utilisent iOS Safari
```

---

## Tests de validation

| Test | Résultat attendu |
|---|---|
| `docker exec whatsapp-back ffmpeg -version` | Affiche la version ffmpeg |
| Commercial envoie un vocal → logs backend | Aucune erreur `ffmpeg exit=` ni `WhapiOutboundError 415` |
| Commercial envoie un vocal → client WhatsApp | Son audible sans action |
| Client envoie un vocal → DevTools Network | `206 Partial Content` + `Content-Type: audio/ogg; codecs=opus` |
| Client envoie un vocal → player frontend | Lecture inline sans téléchargement |
| Fichier local supprimé du disque | `local_url` et `local_path` mis à NULL en DB, fallback provider |
