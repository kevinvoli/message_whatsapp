import { MetaWebhookPayload } from "../interface/whatsapp-whebhook.interface";

export function metaToWhapi(payload: MetaWebhookPayload) {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.messages?.length) return null;

  const message = value.messages[0];
  const contact = value.contacts?.[0];
let text: {body:string} | undefined;
if (message.type === 'text'){
  text= message.text;
}
  return {
    messages: [
      {
        id: message.id,
        from_me: false,
        type: message.type,
        chat_id: `${message.from}@s.whatsapp.net`,
        timestamp: Number(message.timestamp),
        source: 'whatsapp_business',
        from: message.from,
        from_name: contact?.profile?.name ?? 'Unknown',
        text: text,
      },
    ],
    event: {
      type: 'messages',
      event: 'post',
    },
    channel_id: value.metadata.phone_number_id,
  };
}
