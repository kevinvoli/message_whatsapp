#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'message_whatsapp/src/realtime/events/socket-events.constants.ts',
  'front/src/lib/socket/socket-events.constants.ts',
];

function normalize(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')  // commentaires bloc
    .replace(/\/\/.*/g, '')             // commentaires inline
    .replace(/\s/g, '');                // tout l'espace (alignement, indentation, CRLF)
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const results = FILES.map((relPath) => {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.error(`❌ Fichier introuvable : ${relPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return { file: relPath, hash: sha256(normalize(raw)) };
});

const [reference, ...mirrors] = results;
const divergent = mirrors.filter((r) => r.hash !== reference.hash);

if (divergent.length > 0) {
  console.error('');
  console.error('❌  socket-events.constants.ts désynchronisé !');
  console.error(`    Source de vérité : ${reference.file}`);
  console.error('    Fichiers qui divergent :');
  divergent.forEach((r) => console.error(`      - ${r.file}`));
  console.error('');
  console.error('    → Copiez les modifications du backend vers les autres projets');
  console.error('      puis relancez : npm run check:socket-sync');
  console.error('');
  process.exit(1);
}

console.log('✅  socket-events.constants.ts synchronisé sur tous les projets');
process.exit(0);
