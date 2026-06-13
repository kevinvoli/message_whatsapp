# Plan — Vocaux multi-navigateur : diagnostic et correction

> Date : 2026-06-13
> Statut : PLAN (en attente d'implémentation)

---

## 1. État actuel

| Navigateur | Format MediaRecorder | Commercial entend | Client entend |
|---|---|---|---|
| Chrome | `audio/webm;codecs=opus` | ✅ | ✅ |
| Firefox | `audio/ogg;codecs=opus` | ❌ | ❌ |
| Safari iOS | `audio/mp4` | ❌ (non testé) | ❌ (non testé) |
| Edge (Chromium) | `audio/webm;codecs=opus` | ✅ | ✅ |

---

## 2. Analyse du chemin Chrome (qui fonctionne)

### Frontend
```
getUserMedia({ audio: true })
  → MediaRecorder({ mimeType: 'audio/webm;codecs=opus' })
  → Blob { type: 'audio/webm;codecs=opus' }
  → POST /messages/media
      filename: vocal_xxx.webm
      Content-Type multipart: audio/webm;codecs=opus
```

### Backend reçoit
```
file.mimetype = 'audio/webm;codecs=opus'
normalizedMime = 'audio/webm'   ← condition match
```

### Transcodage ffmpeg (Chrome)
```bash
ffmpeg \
  -fflags +genpts \          # corrige les timestamps manquants du WebM MediaRecorder
  -i /tmp/wa-audio-xxx/input.webm \
  -ar 48000 \                # 48 kHz (fréquence native Opus)
  -ac 1 \                    # mono (standard WhatsApp)
  -b:a 24k \                 # 24 kbps (voix)
  -f ogg \                   # container OGG
  -acodec libopus \          # codec Opus
  -vn \                      # pas de piste vidéo
  -y /tmp/wa-audio-xxx/output.ogg
```

**Résultat** : OGG/Opus valide, mono, 48 kHz → accepté par Meta → WhatsApp joue ✅

### Ce qui rend Chrome robuste
- WebM est un format streamable sans métadonnées de durée → `+genpts` corrige ça
- La conversion **cross-container** (WebM→OGG) force ffmpeg à décoder entièrement le flux
  Opus puis le ré-encoder : pas de possibilité de stream-copy

---

## 3. Analyse du chemin Firefox (qui échoue)

### Frontend
```
getUserMedia({ audio: true })
  → MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') → true (Firefox)
  → Blob { type: 'audio/ogg;codecs=opus' }
  → POST /messages/media
      filename: vocal_xxx.ogg
      Content-Type multipart: audio/ogg;codecs=opus
```

### Backend reçoit
```
file.mimetype = 'audio/ogg;codecs=opus'
normalizedMime = 'audio/ogg'   ← condition match (après fix)
```

### Transcodage ffmpeg (Firefox) — état actuel
```bash
ffmpeg \
  # PAS de -fflags +genpts (retiré pour Firefox car casse les granule positions OGG)
  -i /tmp/wa-audio-xxx/input.ogg \
  -ar 48000 \
  -ac 1 \
  -b:a 24k \
  -f ogg \
  -acodec libopus \
  -vn \
  -y /tmp/wa-audio-xxx/output.ogg
```

**Résultat** : OGG produit mais **audio silencieux** ❌

### Hypothèse principale : optimisation stream-copy implicite

Quand l'entrée ET la sortie sont `OGG/Opus`, certaines versions de ffmpeg sur Alpine
détectent que le codec source = codec cible et tentent un **stream-copy implicite**
(copie du flux Opus sans décodage). Cette optimisation contourne le ré-échantillonnage
(`-ar 48000`) et la conversion mono (`-ac 1`), produisant un fichier OGG dont le
container est valide mais le flux audio est bit-exact de Firefox — avec des
**granule positions incorrectes** ou des **headers non conformes à WhatsApp**.

Meta accepte l'upload (retourne un `mediaId`) mais son processeur audio backend
ne peut pas décoder le flux → silence côté client.

### Hypothèse secondaire : headers OGG Firefox non conformes

Firefox MediaRecorder OGG peut inclure :
- Un `OpusHead` avec `channel_mapping_family = 1` (canaux surround) au lieu de `0`
  (mono/stéréo standard) — WhatsApp ne supporte pas ce mapping
- Des `OpusTags` avec des champs propriétaires Firefox
- Des granule positions calculées différemment

Ces headers sont copiés tels quels en cas de stream-copy, rendant le fichier
illisible par WhatsApp même si le container OGG est syntaxiquement correct.

---

## 4. Spécifications WhatsApp audio

| Propriété | Valeur requise |
|---|---|
| Container | OGG |
| Codec | Opus UNIQUEMENT (`OpusHead` version 1, channel_mapping_family 0) |
| Canaux | 1 (mono) obligatoire pour voice notes |
| Sample rate | 48 000 Hz (fréquence native Opus) |
| Bitrate | 8–32 kbps (voix), 24 kbps recommandé |
| Taille max | 16 Mo |
| Formats alternatifs | `audio/mpeg` (MP3), `audio/aac`, `audio/mp4`, `audio/amr` |

---

## 5. Solution recommandée — Fichier WAV intermédiaire

### Principe

Pour tout format **autre que WebM**, utiliser un fichier WAV (PCM brut) comme
étape intermédiaire entre l'entrée Firefox et la sortie OGG/Opus :

```
Firefox OGG/Opus → [décode Opus] → WAV/PCM 48kHz mono → [encode libopus] → OGG/Opus
```

Le WAV est **sans codec** (PCM brut) : il est impossible pour ffmpeg de faire
un stream-copy entre OGG/Opus et WAV. Cela garantit un cycle décoder/ré-encoder
complet, éliminant tout header Firefox non-standard dans le fichier de sortie.

Chrome WebM garde son chemin actuel (qui fonctionne).

### Chemin par navigateur après la correction

```
Chrome  → WebM → [ffmpeg +genpts WebM→OGG] → OGG/Opus standard ✅
Firefox → OGG  → [ffmpeg OGG→WAV] → [ffmpeg WAV→OGG] → OGG/Opus standard ✅
Safari  → MP4  → [ffmpeg OGG→WAV] → [ffmpeg WAV→OGG] → OGG/Opus standard ✅ (bonus)
```

---

## 6. Implémentation

### Fichier : `src/communication_whapi/communication_meta.service.ts`

#### 6.1 — Nouvelle méthode `transcodeToOggViaPcm`

Ajouter une méthode privée qui utilise deux passes ffmpeg :

```typescript
private async transcodeToOggViaPcm(input: Buffer, inputExt: string): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-audio-'));
  const inputPath  = path.join(tmpDir, `input.${inputExt}`);
  const wavPath    = path.join(tmpDir, 'intermediate.wav');
  const outputPath = path.join(tmpDir, 'output.ogg');

  fs.writeFileSync(inputPath, input);

  // Passe 1 : décoder vers WAV PCM (force le décodage Opus complet)
  await this.runFfmpeg([
    '-i', inputPath,
    '-ar', '48000',
    '-ac', '1',
    '-f', 'wav',
    '-acodec', 'pcm_s16le',
    '-vn', '-y', wavPath,
  ], tmpDir);

  // Passe 2 : encoder WAV → OGG/Opus avec paramètres WhatsApp
  const output = await this.runFfmpegToBuffer([
    '-i', wavPath,
    '-ar', '48000',
    '-ac', '1',
    '-b:a', '24k',
    '-f', 'ogg',
    '-acodec', 'libopus',
    '-vn', '-y', outputPath,
  ], outputPath, tmpDir);

  return output;
}
```

#### 6.2 — Helper `runFfmpeg` (exécute ffmpeg, rejette si code ≠ 0)

```typescript
private runFfmpeg(args: string[], tmpDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('error', (err) => { this.cleanupTmpDir(tmpDir); reject(err); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        this.logger.error(
          `ffmpeg pass failed (code=${code ?? 'null'}): ${stderr.slice(0, 600)}`,
          CommunicationMetaService.name,
        );
        this.cleanupTmpDir(tmpDir);
        reject(new Error(`ffmpeg exit=${code ?? 'null'}`));
      }
    });
  });
}
```

#### 6.3 — Helper `runFfmpegToBuffer` (lit le fichier de sortie)

```typescript
private async runFfmpegToBuffer(
  args: string[],
  outputPath: string,
  tmpDir: string,
): Promise<Buffer> {
  await this.runFfmpeg(args, tmpDir);
  const output = fs.readFileSync(outputPath);
  this.cleanupTmpDir(tmpDir);
  if (output.length < 512) {
    throw new Error(`ffmpeg output too small: ${output.length}B`);
  }
  return output;
}
```

#### 6.4 — Modifier `sendMediaMessage` : brancher selon le format d'entrée

```typescript
const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
if (data.mediaType === 'audio') {
  try {
    if (normalizedMime === 'audio/webm') {
      // Chrome : chemin direct WebM→OGG (fonctionne, garder tel quel)
      mediaBuffer = await this.transcodeWebmToOgg(mediaBuffer, normalizedMime);
    } else if (
      normalizedMime === 'audio/ogg' ||
      normalizedMime === 'audio/opus' ||
      normalizedMime === 'audio/mp4' ||
      normalizedMime === 'audio/aac' ||
      normalizedMime === 'audio/mpeg'
    ) {
      // Firefox / Safari / autres : chemin via PCM intermédiaire
      const ext = normalizedMime === 'audio/ogg'  ? 'ogg'
                : normalizedMime === 'audio/opus' ? 'opus'
                : normalizedMime === 'audio/mp4'  ? 'mp4'
                : normalizedMime === 'audio/aac'  ? 'aac'
                : 'mp3';
      mediaBuffer = await this.transcodeToOggViaPcm(mediaBuffer, ext);
    }
    mimeType = 'audio/ogg';
    fileName = fileName.replace(/\.[^.]+$/, '') + '.ogg';
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown_transcode_error';
    throw new WhapiOutboundError(
      `Meta audio transcode failed: ${reason}`,
      'permanent',
      415,
    );
  }
}
```

### Fichier : `src/communication_whapi/outbound-router.service.ts`

#### 6.5 — Aligner le chemin Whapi sur la même logique

Remplacer la condition actuelle dans la branche Whapi :

```typescript
const normalizedWhapi = data.mimeType.split(';')[0].trim().toLowerCase();
let whapiBuffer = data.mediaBuffer;
let whapiMime   = data.mimeType;
let whapiFileName = data.fileName;

if (data.mediaType === 'audio') {
  try {
    if (normalizedWhapi === 'audio/webm') {
      whapiBuffer = await this.metaService.transcodeWebmToOgg(whapiBuffer, normalizedWhapi);
    } else if (normalizedWhapi === 'audio/ogg' || normalizedWhapi === 'audio/opus'
            || normalizedWhapi === 'audio/mp4' || normalizedWhapi === 'audio/aac'
            || normalizedWhapi === 'audio/mpeg') {
      const ext = /* même logique que ci-dessus */ ...;
      whapiBuffer = await this.metaService.transcodeToOggViaPcm(whapiBuffer, ext);
    }
    whapiMime     = 'audio/ogg';
    whapiFileName = data.fileName.replace(/\.[^.]+$/, '') + '.ogg';
  } catch (err) {
    this.logger.warn(
      `Whapi audio transcode failed, sending raw: ${err instanceof Error ? err.message : String(err)}`,
      OutboundRouterService.name,
    );
  }
}
```

---

## 7. Bonus — Ajouter Safari au frontend

Safari iOS supporte `audio/mp4;codecs=mp4a.40.2`. L'ajouter à la liste dans `ChatInput.tsx` :

```typescript
const supportedMimeTypes = [
  'audio/ogg;codecs=opus',       // Firefox
  'audio/ogg',                   // Firefox fallback
  'audio/webm;codecs=opus',      // Chrome / Edge
  'audio/webm',                  // Chrome fallback
  'audio/mp4;codecs=mp4a.40.2', // Safari iOS (NOUVEAU)
  'audio/mp4',                   // Safari iOS fallback
];
```

Le backend gérera maintenant MP4/AAC via `transcodeToOggViaPcm`.

---

## 8. Tests de validation

| Test | Attendu |
|---|---|
| Chrome → envoyer vocal | Son audible ✅ (déjà OK) |
| Firefox → envoyer vocal | Son audible ✅ (après fix) |
| Safari iOS → envoyer vocal | Son audible ✅ (bonus) |
| Commercial écoute son propre vocal | Son audible ✅ |
| Logs backend : aucune erreur `ffmpeg pass failed` | ✅ |
| Fichiers `/tmp/wa-audio-*` nettoyés après envoi | ✅ |

---

## 9. Ordre d'exécution

```
1. Ajouter transcodeToOggViaPcm + runFfmpeg + runFfmpegToBuffer dans communication_meta.service.ts
2. Mettre à jour sendMediaMessage (condition par format)
3. Mettre à jour outbound-router.service.ts (branche Whapi)
4. Mettre à jour ChatInput.tsx (ajouter Safari MP4)
5. Déployer → tester Chrome, Firefox, Safari
```
