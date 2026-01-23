import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@WebSocketGateway()
export class ChannelGateway {
  constructor(private readonly channelService: ChannelService) {}

  @SubscribeMessage('createChannel')
  create(@MessageBody() createChannelDto: CreateChannelDto) {
    return this.channelService.create(createChannelDto);
  }

  @SubscribeMessage('findAllChannel')
  findAll() {
    return this.channelService.findAll();
  }

  @SubscribeMessage('findOneChannel')
  findOne(@MessageBody() id: number) {
    return this.channelService.findOne(id);
  }

  @SubscribeMessage('updateChannel')
  update(@MessageBody() updateChannelDto: UpdateChannelDto) {
    return this.channelService.update(updateChannelDto.id, updateChannelDto);
  }

  @SubscribeMessage('removeChannel')
  remove(@MessageBody() id: number) {
    return this.channelService.remove(id);
  }
}
