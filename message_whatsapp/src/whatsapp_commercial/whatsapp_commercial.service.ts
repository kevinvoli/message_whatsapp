import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';
import { WhatsappCommercial } from './entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { SafeWhatsappCommercial } from './dto/safe-whatsapp-commercial';
import {
  MessageDirection,
  WhatsappMessage,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommercialDashboardDto } from './dto/commercial-Dashboard.dto';

@Injectable()
export class WhatsappCommercialService {
  private readonly logger = new Logger(WhatsappCommercialService.name);

  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly whatsappCommercialRepository: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappPoste)
    private readonly postelRepository: Repository<WhatsappPoste>,

    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  private toSafeUser(user: WhatsappCommercial): SafeWhatsappCommercial {
    const {
      password,
      passwordResetToken,
      passwordResetExpires,
      salt,
      ...safe
    } = user;

    return safe;
  }

  async findOneByEmailWithPassword(
    email: string,
  ): Promise<WhatsappCommercial | null> {
    return this.whatsappCommercialRepository
      .createQueryBuilder('user')
      .addSelect(['user.password', 'user.salt'])
      .leftJoinAndSelect('user.poste', 'poste')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findOneByEmail(email: string): Promise<WhatsappCommercial | null> {
    return this.whatsappCommercialRepository.findOne({ where: { email } });
  }

  async findOneByAutoLoginToken(
    token: string,
  ): Promise<WhatsappCommercial | null> {
    const commercials = await this.whatsappCommercialRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.poste', 'poste')
      .where('user.deletedAt IS NULL')
      .getMany();

    const hmac = (value: string) =>
      crypto
        .createHmac('sha256','gicop')
        .update(value)
        .digest('hex');

    const safeEqual = (a: string, b: string) => {
      const ba = Buffer.from(a, 'hex');
      const bb = Buffer.from(b, 'hex');
      if (ba.length !== bb.length) return false;
      return crypto.timingSafeEqual(ba, bb);
    };

    for (const commercial of commercials) {
      if (commercial.email && safeEqual(hmac(commercial.email), token)) {
        return commercial;
      }
      if (commercial.phone && safeEqual(hmac(commercial.phone), token)) {
        return commercial;
      }
    }

    return null;
  }

  async setConnectionStatus(userId: string, isConnected: boolean) {
    return this.whatsappCommercialRepository.update(userId, {
      isConnected,
      lastConnectionAt: new Date(),
    });
  }

  findOneWithPoste(id: string) {
    return this.whatsappCommercialRepository.findOne({
      where: { id },
      relations: ['poste'],
    });
  }

  async create(
    createWhatsappCommercialDto: CreateWhatsappCommercialDto,
  ): Promise<SafeWhatsappCommercial> {
    const { email, name, password, poste_id } = createWhatsappCommercialDto;

    const existingUser = await this.whatsappCommercialRepository.findOne({
      where: { name },
    });
    if (existingUser) {
      throw new ConflictException('Name already exists');
    }

    const poste = await this.postelRepository.findOne({
      where: { id: poste_id },
    });

    if (!poste)
      throw new NotFoundException(
        `le poste avec l'ID ${poste_id} n'a pas ete trouver`,
      );
    const user = this.whatsappCommercialRepository.create({
      email,
      name,
      password: password,
      poste: poste,
    });

    this.logger.debug(
      `Utilisateur pret a etre enregistre (${email}) poste=${poste_id}`,
    );

    const savedUser = await this.whatsappCommercialRepository.save(user);

    return this.toSafeUser(savedUser);
  }

  async findAll() {
    const users = await this.whatsappCommercialRepository.find({
      // relations: ['poste', 'messages'],
      relations: {
        poste: { chats: true },
        messages: true,
      },
    });

    // Mapper les utilisateurs du backend au type `Commercial` du frontend
    const commerciaux = users.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: user.name.charAt(0).toUpperCase(),
      status: user.isConnected ? 'online' : 'offline',
      email: user.email,
      region: user.poste?.name || 'N/A',
      dernierLogin: user.lastConnectionAt
        ? new Date(user.lastConnectionAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A',
      messagesTraites: user.messages?.length,
      messagesEnvoyes: user.messages?.filter(
        (m) => m.direction === MessageDirection.OUT,
      ).length,
      messagesRecus: user.messages?.filter(
        (m) => m.direction === MessageDirection.IN,
      ).length,
      conversationsActives:
        user.poste?.chats?.filter((c) => c.status === WhatsappChatStatus.ACTIF)
          .length || 0,
      conversationsEnAttente:
        user.poste?.chats?.filter(
          (c) => c.status === WhatsappChatStatus.EN_ATTENTE,
        ).length || 0,
      nouveauxContacts:
        user.poste?.chats?.filter((c) => {
          const createdAt = new Date(c.createdAt);
          const today = new Date();
          return (
            createdAt.getDate() === today.getDate() &&
            createdAt.getMonth() === today.getMonth() &&
            createdAt.getFullYear() === today.getFullYear()
          );
        }).length || 0,
      productivite: 0, // calculé ensuite
    }));

    return commerciaux;
  }

  async getCommercialsDashboard(): Promise<CommercialDashboardDto[]> {
    // Charger les commerciaux avec leur poste uniquement (sans chats ni messages)
    const users = await this.whatsappCommercialRepository.find({
      relations: ['poste'],
    });

    const posteIds = users.map((u) => u.poste?.id).filter(Boolean) as string[];

    // Une seule requête agrégée pour compter les messages par poste
    const msgCounts: { poste_id: string; sent: string; received: string }[] =
      posteIds.length > 0
        ? await this.messageRepository
            .createQueryBuilder('m')
            .select('m.poste_id', 'poste_id')
            .addSelect(
              `SUM(CASE WHEN m.from_me = 1 THEN 1 ELSE 0 END)`,
              'sent',
            )
            .addSelect(
              `SUM(CASE WHEN m.from_me = 0 THEN 1 ELSE 0 END)`,
              'received',
            )
            .where('m.poste_id IN (:...posteIds)', { posteIds })
            .groupBy('m.poste_id')
            .getRawMany()
        : [];

    const msgMap = new Map(
      msgCounts.map((r) => [
        r.poste_id,
        { sent: parseInt(r.sent, 10), received: parseInt(r.received, 10) },
      ]),
    );

    // Une seule requête agrégée pour les stats de chats par poste
    const chatStats: {
      poste_id: string;
      actif: string;
      en_attente: string;
      today: string;
    }[] =
      posteIds.length > 0
        ? await this.chatRepository
            .createQueryBuilder('c')
            .select('c.poste_id', 'poste_id')
            .addSelect(
              `SUM(CASE WHEN c.status = '${WhatsappChatStatus.ACTIF}' THEN 1 ELSE 0 END)`,
              'actif',
            )
            .addSelect(
              `SUM(CASE WHEN c.status = '${WhatsappChatStatus.EN_ATTENTE}' THEN 1 ELSE 0 END)`,
              'en_attente',
            )
            .addSelect(
              `SUM(CASE WHEN DATE(c.createdAt) = CURDATE() THEN 1 ELSE 0 END)`,
              'today',
            )
            .where('c.poste_id IN (:...posteIds)', { posteIds })
            .groupBy('c.poste_id')
            .getRawMany()
        : [];

    const chatMap = new Map(
      chatStats.map((r) => [
        r.poste_id,
        {
          actif: parseInt(r.actif, 10),
          en_attente: parseInt(r.en_attente, 10),
          today: parseInt(r.today, 10),
        },
      ]),
    );

    return users.map((user) => {
      const posteId = user.poste?.id;
      const msg = posteId ? (msgMap.get(posteId) ?? { sent: 0, received: 0 }) : { sent: 0, received: 0 };
      const chat = posteId ? (chatMap.get(posteId) ?? { actif: 0, en_attente: 0, today: 0 }) : { actif: 0, en_attente: 0, today: 0 };

      const productivite = msg.sent + chat.actif * 2 - msg.received * 0.5;

      return {
        id: user.id,
        name: user.name,
        avatar: user.name.charAt(0).toUpperCase(),
        status: user.isConnected ? 'online' : 'offline',
        email: user.email,
        region: user.poste?.name || 'N/A',
        dernierLogin: user.lastConnectionAt
          ? new Date(user.lastConnectionAt).toLocaleString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'N/A',
        messagesEnvoyes: msg.sent,
        messagesRecus: msg.received,
        conversationsActives: chat.actif,
        conversationsEnAttente: chat.en_attente,
        nouveauxContacts: chat.today,
        productivite,
      };
    });
  }

  async findOne(id: string): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
      relations: ['poste'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return this.toSafeUser(user);
  }

  async findStatus(id: string): Promise<boolean> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user.isConnected;
  }

  async findOneById(id: string): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return this.toSafeUser(user);
  }

  async update(
    id: string,
    updateWhatsappCommercialDto: UpdateWhatsappCommercialDto,
  ): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
      relations: ['poste'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Vérifier l'unicité de l'email si fourni et différent de l'actuel
    if (
      updateWhatsappCommercialDto.email &&
      updateWhatsappCommercialDto.email !== user.email
    ) {
      const existingUser = await this.whatsappCommercialRepository.findOne({
        where: { email: updateWhatsappCommercialDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      user.email = updateWhatsappCommercialDto.email;
    }

    if (updateWhatsappCommercialDto.name !== undefined) {
      user.name = updateWhatsappCommercialDto.name;
    }

    if (updateWhatsappCommercialDto.password) {
      user.salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(
        updateWhatsappCommercialDto.password,
        user.salt,
      );
    }

    if (updateWhatsappCommercialDto.poste_id !== undefined) {
      if (updateWhatsappCommercialDto.poste_id === null) {
        user.poste = null;
      } else {
        const poste = await this.postelRepository.findOne({
          where: { id: updateWhatsappCommercialDto.poste_id },
        });
        if (!poste) {
          throw new NotFoundException(
            `Poste with ID "${updateWhatsappCommercialDto.poste_id}" not found`,
          );
        }
        user.poste = poste;
      }
    }

    const updatedUser = await this.whatsappCommercialRepository.save(user);

    return this.toSafeUser(updatedUser);
  }

  async updateStatus(
    id: string,
    status: boolean,
  ): Promise<SafeWhatsappCommercial> {
    try {
      const user = await this.whatsappCommercialRepository.findOne({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException(`User with ID "${id}" not found`);
      }

      // Vérifier que le rôle est valide
      user.isConnected = status;

      const updatedUser = await this.whatsappCommercialRepository.save(user);

      // Logging selon le statut
      const statusText = status ? 'connecté' : 'déconnecté';
      this.logger.log(
        `Commercial ${user.name} (${user.id}) est maintenant ${statusText}`,
      );

      // Émettre un événement si nécessaire
      // this.gateway.emitUserStatusUpdate(id, status);

      return this.toSafeUser(updatedUser);
    } catch (error) {
      // Log détaillé de l'erreur
      this.logger.error(
        `Erreur lors de la mise a jour du statut pour l'utilisateur ${id}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Si l'erreur est déjà une HttpException, la relancer
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Pour les autres erreurs, lancer une InternalServerErrorException
      throw new InternalServerErrorException(
        `Impossible de mettre à jour le statut de l'utilisateur ${id}. Erreur: ${error.message}`,
      );
    }
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.whatsappCommercialRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.whatsappCommercialRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  // Find multiple users by their IDs
  async findByIds(ids: string[]): Promise<SafeWhatsappCommercial[]> {
    return this.whatsappCommercialRepository.findBy({ id: In(ids) });
  }

  async setPasswordResetToken(userId: string, token: string, expires: Date) {
    await this.whatsappCommercialRepository.update(userId, {
      passwordResetToken: token,
      passwordResetExpires: expires,
    });
  }
}
