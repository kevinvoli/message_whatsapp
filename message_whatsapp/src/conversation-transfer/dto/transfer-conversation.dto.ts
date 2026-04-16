export class TransferConversationDto {
  /** ID du poste destination */
  target_poste_id: string;
  /** Motif optionnel (affiché dans le fil de la conversation) */
  reason?: string;
}
