/**
 * source_chat_id  — conversation à absorber (sera fermée après merge)
 * target_chat_id  — conversation qui reçoit les messages (reste active)
 */
export class MergeConversationsDto {
  source_chat_id: string;
  target_chat_id: string;
  reason?: string;
}
