import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';

export class HandleInboundMessageCommand {
  constructor(public readonly messages: UnifiedMessage[]) {}
}
