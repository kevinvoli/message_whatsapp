import { WhatsappChat } from '../definitions';

type RawChat = Partial<WhatsappChat> & {
    unreadCount?: number;
    unread_count?: number;
    channel_id?: string;
    last_msg_client_channel_id?: string;
    client_phone?: string;
    contact_client?: string;
    status?: string;
};

export function normalizeWhatsappChat(chat: RawChat): WhatsappChat {
    const unread = chat.unread_count ?? chat.unreadCount ?? 0;
    const status =
        chat.status === 'en attente'
            ? 'attente'
            : (chat.status as WhatsappChat['status']) ?? 'attente';

    return {
        id: chat.id ?? '',
        chat_id: chat.chat_id ?? '',
        channel_id: chat.channel_id ?? chat.last_msg_client_channel_id,
        last_msg_client_channel_id: chat.last_msg_client_channel_id ?? chat.channel_id,
        poste_id: chat.poste_id ?? chat.poste?.id,
        name: chat.name ?? 'Client inconnu',
        type: chat.type ?? 'private',
        chat_pic: chat.chat_pic ?? '',
        chat_pic_full: chat.chat_pic_full ?? '',
        is_pinned: chat.is_pinned ?? false,
        is_muted: chat.is_muted ?? false,
        mute_until: chat.mute_until ?? null,
        is_archived: chat.is_archived ?? false,
        unread_count: unread,
        unreadCount: unread,
        status,
        unread_mention: chat.unread_mention ?? false,
        read_only: chat.read_only ?? false,
        not_spam: chat.not_spam ?? true,
        contact_client: chat.contact_client ?? chat.client_phone ?? '',
        client_phone: chat.client_phone ?? chat.contact_client,
        assigned_at: chat.assigned_at ?? null,
        assigned_mode: chat.assigned_mode ?? null,
        first_response_deadline_at: chat.first_response_deadline_at ?? null,
        last_client_message_at: chat.last_client_message_at ?? null,
        last_poste_message_at: chat.last_poste_message_at ?? null,
        auto_message_id: chat.auto_message_id ?? null,
        current_auto_message_id: chat.current_auto_message_id ?? null,
        auto_message_status: chat.auto_message_status ?? null,
        auto_message_step: chat.auto_message_step ?? 0,
        waiting_client_reply: chat.waiting_client_reply ?? false,
        last_auto_message_sent_at: chat.last_auto_message_sent_at ?? null,
        last_activity_at: chat.last_activity_at ?? '',
        createdAt: chat.createdAt ?? new Date(0).toISOString(),
        updatedAt: chat.updatedAt ?? new Date(0).toISOString(),
        poste: chat.poste as WhatsappChat['poste'],
        channel: chat.channel as WhatsappChat['channel'],
        contact: (chat as any).contact as WhatsappChat['contact'],
        messages: (chat.messages ?? []) as WhatsappChat['messages'],
        last_message: (chat as any).last_message ?? null,
    };
}
