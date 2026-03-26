export class GetConversationsForAgentQuery {
  constructor(
    public readonly chatId?: string,
    public readonly limit?: number,
    public readonly offset?: number,
    public readonly dateStart?: Date,
    public readonly posteId?: string,
    public readonly commercialId?: string,
  ) {}
}
