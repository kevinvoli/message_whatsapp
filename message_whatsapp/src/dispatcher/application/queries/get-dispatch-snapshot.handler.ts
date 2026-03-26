import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetDispatchSnapshotQuery } from 'src/application/queries/get-dispatch-snapshot.query';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';

@QueryHandler(GetDispatchSnapshotQuery)
export class GetDispatchSnapshotHandler
  implements IQueryHandler<GetDispatchSnapshotQuery>
{
  private readonly logger = new Logger(GetDispatchSnapshotHandler.name);

  constructor(private readonly dispatcherService: DispatcherService) {}

  async execute(_query: GetDispatchSnapshotQuery): Promise<{
    queue_size: number;
    waiting_count: number;
    waiting_items: unknown[];
  }> {
    this.logger.debug('QRY:GetDispatchSnapshot');
    return this.dispatcherService.getDispatchSnapshot();
  }
}
