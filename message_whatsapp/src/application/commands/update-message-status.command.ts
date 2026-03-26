import { UnifiedStatus } from 'src/webhooks/normalization/unified-status';

export class UpdateMessageStatusCommand {
  constructor(public readonly statuses: UnifiedStatus[]) {}
}
