export class SendTextMessageCommand {
  constructor(
    public readonly chatId: string,
    public readonly text: string,
    public readonly posteId: string,
    public readonly channelId: string,
    public readonly quotedMessageId?: string,
  ) {}
}
