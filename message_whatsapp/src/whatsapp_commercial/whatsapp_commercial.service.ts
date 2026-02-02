import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';
import { WhatsappCommercial } from './entities/user.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { SafeWhatsappCommercial } from './dto/safe-whatsapp-commercial';

@Injectable()
export class WhatsappCommercialService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly whatsappCommercialRepository: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappPoste)
    private readonly PostelRepository: Repository<WhatsappPoste>,

    // @InjectRepository(QueuePosition)
    // private readonly queuePositionRepository: Repository<QueuePosition>,
    // private readonly queueService: QueueService,
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

async findOneByEmailWithPassword(email: string): Promise<WhatsappCommercial | null> {
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

    const poste  = await this.PostelRepository.findOne({
      where:{id:poste_id}
    })

    if (!poste) throw new NotFoundException(`le poste avec l'ID ${poste_id} n'a pas ete trouver`)
    const user = this.whatsappCommercialRepository.create({
      email,
      name,
      password: password,
      poste: poste
    });

    console.log("utilisateur pres a etre enregistre", user);
    
    const savedUser = await this.whatsappCommercialRepository.save(user);

    return this.toSafeUser(savedUser)
  }

  async findAll(): Promise<WhatsappCommercial[]> {
    const users = await this.whatsappCommercialRepository.find();
    return users
  }

  async findOne(id: string): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
      relations:['poste']
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    
    return this.toSafeUser(user)
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

    return this.toSafeUser(user)
  }

  async update(
    id: string,
    updateWhatsappCommercialDto: UpdateWhatsappCommercialDto,
  ): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
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

    // Mettre à jour le nom si fourni
    if (updateWhatsappCommercialDto.name !== undefined) {
      user.name = updateWhatsappCommercialDto.name;
    }

    const updatedUser = await this.whatsappCommercialRepository.save(user);

    return this.toSafeUser(updatedUser)
  }

async updateStatus(id: string, status: boolean):Promise<SafeWhatsappCommercial> {
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
    console.log(
      `🔌 Commercial ${user.name} (${user.id}) est maintenant ${statusText}`,
    );

    // Émettre un événement si nécessaire
    // this.gateway.emitUserStatusUpdate(id, status);
    
    return this.toSafeUser(updatedUser);
    
  } catch (error) {
    // Log détaillé de l'erreur
    console.error(`❌ Erreur lors de la mise à jour du statut pour l'utilisateur ${id}:`, {
      error: error.message,
      stack: error.stack,
      status,
      timestamp: new Date().toISOString()
    });

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

  async updateRole(id: string, role: string): Promise<SafeWhatsappCommercial> {
    const user = await this.whatsappCommercialRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Vérifier que le rôle est valide
    if (!['ADMIN', 'COMMERCIAL'].includes(role)) {
      throw new BadRequestException('Invalid role');
    }

    user.role = role;
    const updatedUser = await this.whatsappCommercialRepository.save(user);
    return this.toSafeUser(updatedUser)
  }

  async remove(id: string): Promise<void> {
    const result = await this.whatsappCommercialRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  // This method is for internal use by AuthService and should return the full user object
  async findByEmail(email: string): Promise<SafeWhatsappCommercial | null> {
    return this.whatsappCommercialRepository.findOne({
      where: { email },
      relations: ['poste'],
    });
  }

  // This method is for internal use by AuthService
  async findById(id: string): Promise<SafeWhatsappCommercial | null> {
    return this.whatsappCommercialRepository.findOne({
      where: { id },
    });
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

  async findByPasswordResetToken(
    token: string,
  ): Promise<SafeWhatsappCommercial | null> {
    return this.whatsappCommercialRepository.findOne({
      where: { passwordResetToken: token },
    });
  }
}
