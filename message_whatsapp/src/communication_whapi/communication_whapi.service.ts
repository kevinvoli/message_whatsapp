import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCommunicationWhapiDto } from './dto/create-communication_whapi.dto';
import { UpdateCommunicationWhapiDto } from './dto/update-communication_whapi.dto';
import axios from 'axios';
import { CreateChannelDto } from 'src/channel/dto/create-channel.dto';
import { ChanneDatalDto } from 'src/channel/dto/channel-data.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Injectable()
export class CommunicationWhapiService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
  ) {}

  // async sendToWhapi(
  //   to: string,
  //   text: string,
  // ): Promise<{
  //   id: string;
  //   status: number;
  //   statusText: string;
  // }> {
  //   const response = await axios.post(
  //     this.WHAPI_URL,
  //     {
  //       to, // ex: "2250700000000"
  //       body: text,
  //     },
  //     {
  //       headers: {
  //         Authorization: `Bearer ${this.WHAPI_TOKEN}`,
  //         'Content-Type': 'application/json',
  //       },
  //     },
  //   );

  //   return response.data as {
  //     id: string;
  //     status: number;
  //     statusText: string;
  //   };
  // }

  async sendToWhapiChannel(data: {
    text: string;
    to: string;
    channelId: string;
  }): Promise<{
    id: string;
    status: number;
    statusText: string;
  }> {
    const channel = await this.channelRepository.findOne({
      where: { channel_id: data.channelId },
    });
    const token = channel?.token;

    if (!channel) {
      return { id: 'null', status: 500, statusText: 'null' };
    }

    console.log("les channe a envoie =============================================",{
        to: data.to, // ex: "2250700000000"
        body: data.text,
      },);

    const response = await axios.post(
      this.WHAPI_URL,
      {
        to: data.to, // ex: "2250700000000"
        body: data.text,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data as {
      id: string;
      status: number;
      statusText: string;
    };
  }

  async getChannel(token: CreateChannelDto): Promise<ChanneDatalDto | null> {
    console.log('canal trouvye***********************', token.token);

    try {
      const response: { data: any } = await axios.get(
        'https://gate.whapi.cloud/health?wakeup=true&platform=Chrome%2CWhapi%2C1.6.0&channel_type=web',
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token?.token}`,
          },
        },
      );
      console.log(
        '===========eeerrr===============================================================',
        response.data,
      );

      if (!response) {
        console.log(
          '************************************************************************',
        );
        return null;
      }

      return response.data;
    } catch (error) {
      console.log(
        'error===================error===================error====================================',
        error,
      );
      throw new NotFoundException(new Error(error));
    }
  }

  async sendMedia(to: string, mediaUrl: string): Promise<any> {
    // This is a placeholder for the actual media sending logic.
    // The implementation will depend on the Whapi.cloud API for sending media.
    console.log(`Sending media to ${to} with URL ${mediaUrl}`);
    return Promise.resolve({ id: 'fake-media-id', status: 'sent' });
  }
}
