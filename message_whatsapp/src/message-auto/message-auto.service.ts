import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageAuto } from './entities/message-auto.entity';
import { Repository } from 'typeorm';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { CreateMessageAutoDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class MessageAutoService {
  constructor(
    @InjectRepository(MessageAuto)
    private readonly autoMessageRepo: Repository<MessageAuto>,

    private readonly chatService: WhatsappChatService,
    private readonly messageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly gateway: WhatsappMessageGateway,
    private readonly logger: AppLogger,
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
      where: { position, actif: true },
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
    const chat = await this.chatService.findBychat_id(chatId);

    if (!chat) return;

    if (!chat.last_msg_client_channel_id) {
      throw new Error(
        `Impossible d'envoyer un message auto : channel manquant pour le chat ${chatId}`,
      );
    }

    this.logger.debug(
      `Auto message step ${chat.auto_message_step} for ${chat.chat_id}`,
      MessageAutoService.name,
    );

    const template = await this.getAutoMessageByPosition(position);

    if (!template) {
      this.logger.debug(
        `No active template at position ${position} — skipping auto message for ${chatId}`,
        MessageAutoService.name,
      );
      return;
    }

    // Marquer la conversation comme "en cours d'envoi"
    await this.chatService.update(chatId, {
      read_only: true,
      auto_message_status: 'sending',
    });

    try {
      const mes = this.formatMessageAuto({
        message: template.body,
        name: chat.name,
        numero: chat.contact_client,
      });

      const message = await this.messageService.createAgentMessage({
        chat_id: chat.chat_id,
        poste_id: null, // ne pas mettre à jour last_poste_message_at (réservé aux vrais agents)
        text: mes,
        timestamp: new Date(
          chat?.last_client_message_at
            ? chat.last_client_message_at.getTime() + 1000
            : Date.now(),
        ),
        channel_id: chat.last_msg_client_channel_id,
      });

      await this.gateway.notifyNewMessage(message, chat);

      // Débloquer après envoi
      await this.chatService.update(chatId, {
        read_only: false,
        auto_message_status: 'sent',
        auto_message_id: template.id,
      });
    } catch (err) {
      // Toujours débloquer la conversation même en cas d'erreur
      await this.chatService.update(chatId, {
        read_only: false,
        auto_message_status: 'failed',
      });
      throw err;
    }
  }

  private formatMessageAuto(data: {
    message: string;
    name?: string;
    numero?: string;
  }): string {
    const safeName = this.normalizeClientName(data.name);

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
