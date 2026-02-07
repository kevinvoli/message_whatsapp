import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageAuto } from './entities/message-auto.entity';
import { Repository } from 'typeorm';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { CreateMessageAutoDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';

@Injectable()
export class MessageAutoService {
  constructor(
    @InjectRepository(MessageAuto)
    private readonly autoMessageRepo: Repository<MessageAuto>,

    private readonly chatService: WhatsappChatService,
    private readonly messageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  async create(dto: CreateMessageAutoDto): Promise<MessageAuto> {
    const message = this.autoMessageRepo.create(dto);
    return await this.autoMessageRepo.save(message);
  }

  async findAll(): Promise<MessageAuto[]> {
    return await this.autoMessageRepo.find({ order: { position: 'ASC' } });
  }

  async findOne(id: string): Promise<MessageAuto> {
    const message = await this.autoMessageRepo.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException(`Auto message with ID ${id} not found`);
    }
    return message;
  }

  async update(id: string, dto: UpdateMessageAutoDto): Promise<MessageAuto> {
    const message = await this.findOne(id);
    Object.assign(message, dto);
    return await this.autoMessageRepo.save(message);
  }

  async remove(id: string): Promise<void> {
    const result = await this.autoMessageRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Auto message with ID ${id} not found`);
    }
  }

  /**
   * 1️⃣ Récupère un message auto actif par position
   */
  async getAutoMessageByPosition(
    position: number,
  ): Promise<MessageAuto | null> {
    const messages = await this.autoMessageRepo.find({
      where: { position },
    });

    if (!messages.length) return null;

    // 🎲 tirage aléatoire
    const randomIndex = Math.floor(Math.random() * messages.length);

    return messages[randomIndex];
  }

  /**
   * 2️⃣ Lance l’envoi d’un message auto
   */
  async sendAutoMessage(chatId: string, position: number): Promise<void> {
    // console.log("message automatique",chatId,position);

    const chat = await this.chatService.findBychat_id(chatId);

    if (!chat) return;

    if (!chat.poste?.id) {
      throw new Error(
        `Impossible d'envoyer un message auto : poste manquant pour le chat ${chatId}`,
      );
    }

    if (!chat.last_msg_client_channel_id) {
      throw new Error(
        `Impossible d'envoyer un message auto : channel manquant pour le chat ${chatId}`,
      );
    }

    console.log(
      '====affichage des temple aleatoire====',
      chat.auto_message_step,
    );

    const template = await this.getAutoMessageByPosition(position);

    if (!template) return;
    // console.log("affichage des temple aleatoire",template);

    // Marquer la conversation comme bloquée
    await this.chatService.update(chatId, {
      readonly: true,
      auto_message_status: 'sending',
    });

    const mes = this.formatMessageAuto({
      message: template.body,
      name: chat.name,
      numero: chat.contact_client,
    });

    const message = await this.messageService.createAgentMessage({
      chat_id: chat.chat_id,
      poste_id: chat.poste.id,
      text: mes,
      timestamp: new Date(
        chat?.last_client_message_at
          ? chat.last_client_message_at.getTime() + 1000
          : Date.now()
      ),
      channel_id: chat.last_msg_client_channel_id,
    });

    await this.gateway.notifyNewMessage(message, chat);

    // Débloquer après envoi
    await this.chatService.update(chatId, {
      readonly: false,
      auto_message_status: 'sent',
      auto_message_id: template.id,
    });
  }

  private formatMessageAuto(data: {
    message: string;
    name?: string;
    numero?: string;
  }): string {
    const safeName = this.normalizeClientName(data.name);
    // console.log("safeName",safeName);

    return data.message
      .replace(/#name#/gi, safeName)
      .replace(/#numero#/gi, data.numero ?? '');
  }

  private normalizeClientName(rawName?: string): string {
    if (!rawName) return 'Client';

    const titlesRegex =
      /(^|\s)(mr\.?|monsieur|mme\.?|madame|mademoiselle)\s+/gi;

    const cleaned = rawName
      .replace(titlesRegex, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return 'Client';

    // On prend le premier mot (souvent le prénom)
    const firstName = cleaned.split(' ')[0];

    // Capitalisation propre
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
}

// "Bonjour Madame #name#,  J'espère que vous allez bien ? Je suis votre conseillère de GICOP, comment puis-je vous aider ?"
