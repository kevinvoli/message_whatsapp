import { Body, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { CreateChannelDto } from 'src/channel/dto/create-channel.dto';
import { ChanneDatalDto } from 'src/channel/dto/channel-data.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhapiSendMessageResponse } from './dto/whapi-send-message-response.dto';

@Injectable()
export class CommunicationWhapiService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
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

async sendTyping(chat_id: string, typing: boolean) {
  try {
    const chat = await this.chatRepository.findOne({
      where: { chat_id },
      relations: { poste: true },
    });
    if (!chat) return;

    const channel = await this.channelRepository.findOne({
      where: { channel_id: chat.last_msg_client_channel_id },
    });
    if (!channel) return;

    const token = channel.token;

    // PAS de messageId ici !
    await axios.post(
       `https://gate.whapi.cloud/messages/presence`,
      // `${this.WHAPI_URL}`,
      {
        messaging_product: "whatsapp",
        to: chat.contact_client,
        type: "typing",
        typing: typing ? "on" : "off", 
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Typing sent to Whapi:", chat.contact_client, typing);
  } catch (err) {
    console.error("❌ Whapi typing error", err?.response?.data || err);
  }
}


  async sendToWhapiChannel(data: {
    text: string;
    to: string;
    channelId: string;
  }): Promise<WhapiSendMessageResponse> {
    const channel = await this.channelRepository.findOne({
      where: { channel_id: data.channelId },
    });
    const token = channel?.token;

    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }
    const response = await axios.post<WhapiSendMessageResponse>(
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

    return response.data;
  }

  generateWhapiMessageId(): string {
    const part = (len: number) =>
      Math.random()
        .toString(36)
        .substring(2, 2 + len)
        .toUpperCase();
    return `${part(8)}-${part(6)}-${part(4)}`;
  }
  async getChannel(token: CreateChannelDto): Promise<ChanneDatalDto | null> {
    try {
      const response: { data: any } = await axios.get<WhapiSendMessageResponse>(
        'https://gate.whapi.cloud/health?wakeup=true&platform=Chrome%2CWhapi%2C1.6.0&channel_type=web',
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token?.token}`,
          },
        },
      );

      if (!response) {
        return null;
      }

      return response.data;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }
}
