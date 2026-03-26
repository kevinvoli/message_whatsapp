export class AssignConversationCommand {
  constructor(
    public readonly chatId: string,
    public readonly fromName: string,
    public readonly traceId: string,
    public readonly tenantId: string,
  ) {}
}
