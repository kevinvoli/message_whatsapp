const mysql = require('mysql');
require('dotenv').config();

const conn = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

function runSearch(search) {
  return new Promise((resolve, reject) => {
    const digits = search.replace(/\D/g, '');
    let sql, params;
    if (digits) {
      sql = `SELECT chat_id, name, last_activity_at, status FROM whatsapp_chat
             WHERE deletedAt IS NULL AND (name LIKE ? OR chat_id LIKE ? OR chat_id LIKE ?)
             ORDER BY last_activity_at DESC LIMIT 10`;
      params = [`%${search}%`, `%${search}%`, `%${digits}%`];
    } else {
      sql = `SELECT chat_id, name, last_activity_at, status FROM whatsapp_chat
             WHERE deletedAt IS NULL AND (name LIKE ? OR chat_id LIKE ?)
             ORDER BY last_activity_at DESC LIMIT 10`;
      params = [`%${search}%`, `%${search}%`];
    }
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async () => {
  try {
    // Trouver un échantillon de chat_id / name pour construire des cas de test réalistes
    const sample = await new Promise((resolve, reject) => {
      conn.query(
        `SELECT chat_id, name, status, last_activity_at FROM whatsapp_chat WHERE deletedAt IS NULL ORDER BY last_activity_at DESC LIMIT 5`,
        (err, rows) => err ? reject(err) : resolve(rows),
      );
    });
    console.log('--- Échantillon de conversations ---');
    console.log(sample);

    if (sample.length > 0) {
      const ref = sample[0];
      console.log('\n--- Conversation de référence ---', ref);

      // Extraire un numéro à partir du chat_id (ex: 33612345678@s.whatsapp.net -> 33612345678)
      const m = ref.chat_id.match(/(\d+)/);
      const fullDigits = m ? m[1] : '';
      console.log('Digits extraits du chat_id:', fullDigits);

      const testCases = [];
      if (fullDigits.length >= 9) {
        const local = '0' + fullDigits.slice(-9); // format 0XXXXXXXXX
        const noZero = fullDigits.slice(-9);
        const spaced = local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
        testCases.push(local, noZero, spaced, fullDigits);
      }
      if (ref.name) {
        testCases.push(ref.name.slice(0, 4));
      }

      for (const tc of testCases) {
        const rows = await runSearch(tc);
        const found = rows.some(r => r.chat_id === ref.chat_id);
        console.log(`\nsearch="${tc}" -> ${rows.length} résultat(s), conv. de référence trouvée: ${found}`);
        rows.slice(0, 3).forEach(r => console.log('   ', r.chat_id, '|', r.name, '|', r.status));
      }

      // Cas vide / inexistant
      const none = await runSearch('zzzz_inexistant_xyz');
      console.log('\nsearch="zzzz_inexistant_xyz" ->', none.length, 'résultat(s) (attendu: 0)');
    } else {
      console.log('Aucune conversation en base pour tester.');
    }
  } catch (e) {
    console.error('ERREUR:', e.message);
  } finally {
    conn.end();
  }
})();
