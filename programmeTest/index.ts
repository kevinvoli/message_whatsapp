import axios from "axios";
import { config } from "./config.js";
import { generateChatIds, generateMessage } from "./generator.js";
import { generateWebhookPayload } from "./webhook.js";
import { stats } from "./stats-instance.js";
import { WhapiWebhookPayload } from "./payload.js";

export async function sendMessage(payload: WhapiWebhookPayload) {
  stats.sent++;

  // on prend l'id du premier message pour le suivi
  const messageId = payload.messages[0]?.id || "unknown";

  try {
    console.log("Numero: ", payload);
    
    
    const res = await axios.post(config.webhookUrl, payload, {
      // timeout: 10000,
      validateStatus: () => true, // aucune exception pour statut http
      headers: {
        "Content-Type": "application/json", // obligatoire pour JSON
        Accept: "application/json", // ce que tu attends en retour
        "X-Custom-Token": "ton_token_ici", // exemple d’entête custom
        "User-Agent": "StressTest/1.0", // personnalisation de l’UA
      },
    });

    if (res.status >= 200 && res.status < 300) {
      stats.recordSuccess(res);
    } else {
      const error = new Error(res.data?.message || `HTTP ${res.status}`);
      // on ajoute status code pour stats
      (error as any).statusCode = res.status;

      stats.recordFailure(error, payload);
    }
  } catch (err: any) {
    stats.recordFailure(err, payload);
  }
}

export async function runStressTest() {
  console.warn("🔥 Démarrage stress test");

  const chatIds = generateChatIds(config.conversationsCount);
  const batch: Promise<void>[] = [];

  for (const chatId of chatIds) {
    for (let i = 0; i < config.messagesPerconversation; i++) {
      const payload = generateWebhookPayload(chatId);
      batch.push(sendMessage(payload));

      if (batch.length >= config.parallelRequests) {
        await Promise.all(batch);
        batch.length = 0;
      }
    }
  }

  if (batch.length) await Promise.all(batch);

  console.log("✅ Stress test terminé");
  console.table(stats.summary());

  if (stats.failedMessages.length) {
    console.log("❌ DÉTAIL DES ÉCHECS");

    console.table(
      stats.failedMessages.map((f, i) => ({
        "#": i + 1,
        type: f.errorType,
        status: f.statusCode ?? "—",
        message: f.errorMessage,
        chat_id: f.chatId,
      })),
    );
  }
}

runStressTest();
