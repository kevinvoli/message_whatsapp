const fs = require('fs');
const path = require('path');

const TABLE_MAP = {
  '01_postes': 'whatsapp_poste',
  '02_channels': 'whapi_channels',
  '03_commerciaux': 'whatsapp_commercial',
  '04_contacts': 'contact',
  '05_chats': 'whatsapp_chat',
  '06_messages': 'whatsapp_message',
  '07_commercial_identity_mapping': 'commercial_identity_mapping',
  '08_client_identity_mapping': 'client_identity_mapping',
  '09_obligation_batches': 'commercial_obligation_batch',
  '10_call_tasks': 'call_task',
  '11_validation_criterion_config': 'validation_criterion_config',
  '12_conversation_validations': 'conversation_validation',
  '13_call_events': 'call_event',
  '14_conversation_reports': 'conversation_report',
  '15_follow_ups': 'follow_up',
  '16_commercial_targets': 'commercial_target',
  '17_commercial_daily_performance': 'commercial_daily_performance',
  '18_db2_users': 'users',
  '19_db2_commandes': 'commandes',
  '20_db2_call_logs': 'call_logs',
  '21_order_call_sync_cursor': 'order_call_sync_cursor',
  '22_integration_sync_logs': 'integration_sync_log',
  '23_commercial_action_tasks': 'commercial_action_task',
};

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  const str = String(val);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function jsonToSql(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const lines = [`-- Table: ${tableName}`, `-- ${rows.length} enregistrement(s)`, ''];
  const columns = Object.keys(rows[0]);
  const colList = columns.map(c => `\`${c}\``).join(', ');

  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map(row => {
      const vals = columns.map(c => escapeValue(row[c])).join(', ');
      return `  (${vals})`;
    });
    lines.push(`INSERT INTO \`${tableName}\` (${colList}) VALUES`);
    lines.push(values.join(',\n') + ';');
    lines.push('');
  }
  return lines.join('\n');
}

const dir = __dirname;
const outDir = path.join(dir, 'sql');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

let allSql = [
  '-- ============================================================',
  '-- SEED DATA — Projet WhatsApp GICOP',
  `-- Généré le ${new Date().toISOString().slice(0, 10)}`,
  '-- Importer dans l\'ordre numérique pour respecter les FK',
  '-- ============================================================',
  '',
  'SET FOREIGN_KEY_CHECKS = 0;',
  'SET NAMES utf8mb4;',
  '',
];

let ok = 0, errors = [];

for (const [fileKey, tableName] of Object.entries(TABLE_MAP)) {
  const jsonFile = path.join(dir, `${fileKey}.json`);
  if (!fs.existsSync(jsonFile)) {
    errors.push(`MANQUANT: ${fileKey}.json`);
    continue;
  }
  try {
    const raw = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : [data];
    const sql = jsonToSql(tableName, rows);

    // Fichier SQL individuel
    const outFile = path.join(outDir, `${fileKey}.sql`);
    fs.writeFileSync(outFile, `SET FOREIGN_KEY_CHECKS = 0;\nSET NAMES utf8mb4;\n\n${sql}\nSET FOREIGN_KEY_CHECKS = 1;\n`, 'utf8');

    allSql.push(sql);
    console.log(`✓ ${fileKey}.json → ${tableName} (${rows.length} lignes)`);
    ok++;
  } catch (e) {
    errors.push(`ERREUR ${fileKey}.json: ${e.message}`);
  }
}

allSql.push('SET FOREIGN_KEY_CHECKS = 1;');

// Fichier SQL global
const globalFile = path.join(outDir, '00_ALL_SEED_DATA.sql');
fs.writeFileSync(globalFile, allSql.join('\n'), 'utf8');

console.log('');
console.log(`=== Résultat: ${ok} fichiers convertis ===`);
console.log(`Fichiers SQL individuels: programmeTest/seed-data/sql/`);
console.log(`Fichier SQL global: programmeTest/seed-data/sql/00_ALL_SEED_DATA.sql`);
if (errors.length) {
  console.log('\nErreurs:');
  errors.forEach(e => console.log('  ' + e));
}
