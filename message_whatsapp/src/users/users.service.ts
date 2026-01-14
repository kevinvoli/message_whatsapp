import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { WhatsappCommercial  } from './entities/user.entity';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class WhatsappCommercialService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly userRepository: Repository<WhatsappCommercial>,
 
  ) {}

  async findOneByEmail(email: string): Promise<WhatsappCommercial | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async setConnectionStatus(userId: string, isConnected: boolean) {
    return this.userRepository.update(userId, {
      isConnected,
      lastConnectionAt: new Date(),
    });
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { email, name, password } = createUserDto;

    const existingUser = await this.userRepository.findOne({ where: { name } });
    if (existingUser) {
      throw new ConflictException('Name already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email,
      name,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    return {
      id: savedUser.id,
      email: savedUser.email,
      name: savedUser.name,
    };
  }

  async findAll(): Promise<SafeUser[]> {
    const users = await this.userRepository.find();
    return users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
    }));
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async findOneById(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Update email if provided
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({ where: { email: updateUserDto.email } });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      user.email = updateUserDto.email;
    }

    // This method will NOT update the role. That's handled by updateRole.

    const savedUser = await this.userRepository.save(user);

    return {
      id: savedUser.id,
      email: savedUser.email,
      name: savedUser.name,
    };
  }



  async remove(id: string): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  // This method is for internal use by AuthService and should return the full user object
  async findByEmail(email: string): Promise<WhatsappCommercial | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });
  }

  // This method is for internal use by AuthService
  async findById(id: string): Promise<WhatsappCommercial | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  // Find multiple users by their IDs
  async findByIds(ids: number[]): Promise<WhatsappCommercial[]> {
    return this.userRepository.findBy({ id: In(ids) });
  }

  async setPasswordResetToken(userId: number, token: string, expires: Date) {
    // Storing the raw token is acceptable for a short-lived, single-use token.
    // Hashing it would prevent us from looking up the user by the token.
    await this.userRepository.update(userId, {
      passwordResetToken: token,
      passwordResetExpires: expires,
    });
  }

  async findByPasswordResetToken(token: string): Promise<WhatsappCommercial | null> {
 
    return this.userRepository.findOne({ where: { passwordResetToken: token } });
  }

  // async updatePassword(userId: number, newPassword: string): Promise<void> {
  //   const salt = await bcrypt.genSalt(10);
  //   const hashedPassword = await bcrypt.hash(newPassword, salt);
  //   await this.userRepository.update(userId, {
  //     password: hashedPassword,
  //     passwordResetToken: null,
  //     passwordResetExpires: null,
  //   });
  // }
}
