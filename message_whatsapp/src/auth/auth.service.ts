import { 
  BadRequestException, 
  HttpException, 
  HttpStatus, 
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException 
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Token } from './entities/token.entity';
import { TokenService } from './jwt.service';
import * as speakeasy from 'speakeasy';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from '../users/entity/users.entity';
import { JwtPayload } from './interface/payload.interface';
import { LoginUserDto } from './dto/login-user.dto';
import { Contact } from '../users/dto/create-users.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginUserDto: LoginUserDto): Promise<{ 
    token: string;
    refreshToken: string;
    user: {
      id: number;
      name: string;
      role: {name:string};
      reseteSoldeDate?: Date | null;
      phone: string;
      idNumber: string;
      address: string;
      Contact: Contact[];
    }
  }> {
    const { email, password } = loginUserDto;
    
    // Validation des entrées
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    try {
      // Récupération sécurisée de l'utilisateur
      const user = await this.usersRepository.findOne({
        where: { email },
        relations: ['role', 'emergencyContacts'],
        select: [
          'id', 'email', 'name', 'password', 'salt', 
          'phoneNumber', 'cni', 'address', 'reseteSoldeDate'
        ]
      });

      if (!user) {
        this.logger.warn(`Login attempt for unknown email: ${email}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Validation du mot de passe
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        this.logger.warn(`Invalid password attempt for user: ${user.id}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Création des tokens
      const payload: JwtPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        roleId: user.role?.id,
        role: user.role?.name
      };

      if (!payload.role) {
        throw new UnauthorizedException('User role not found');
      }

      const [accessToken, refreshToken] = await Promise.all([
        this.tokenService.getAccessToken(payload),
        this.tokenService.getRefreshToken(payload)
      ]);

      // Mise à jour du refresh token
      await this.tokenService.updateRefreshTokenInUser(
        { 
          accessToken, 
          refreshToken, 
          role: payload.role 
        },
        payload.id
      );

      return {
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          role:{name: user.role.name},
          phone: user.phoneNumber || '',
          idNumber: user.cni || '',
          address: user.address || '',
          Contact: user.emergencyContacts || [],
          reseteSoldeDate: user.reseteSoldeDate
        }
      };
    } catch (error) {
      this.logger.error(`Login error for ${email}: ${error.message}`, error.stack);
      throw new HttpException(
        error instanceof HttpException ? error.message : 'Authentication failed',
        error instanceof HttpException ? error.getStatus() : HttpStatus.UNAUTHORIZED
      );
    }
  }

  async logout(userId: number): Promise<boolean> {
    try {
      await this.tokenService.invalidateTokens(userId);
      this.logger.log(`User ${userId} logged out successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Logout error for user ${userId}: ${error.message}`);
      throw new HttpException(
        'Logout failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{ 
    accessToken: string; 
    refreshToken: string 
  }> {
    try {
      // Vérification du refresh token
      const payload = await this.tokenService.verifyToken(refreshToken, true);
      
      // Validation supplémentaire
      const isValid = await this.tokenService.validateRefreshToken(
        payload.id, 
        refreshToken
      );
      
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Rotation des tokens
      return await this.tokenService.rotateTokens(payload);
    } catch (error) {
      this.logger.error(`Refresh token error: ${error.message}`);
      throw new HttpException(
        'Invalid refresh token',
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  async resetPasswordRequest(email: string): Promise<{ code: string }> {
    try {
      const user = await this.usersRepository.findOne({ where: { email } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const code = speakeasy.totp({
        secret: this.configService.get('RESET_PASSWORD_SECRET') + user.salt,
        digits: 6,
        step: 60 * 15, // 15 minutes
        encoding: 'base32'
      });

      // En production, vous devriez envoyer le code par email/SMS
      return { code };
    } catch (error) {
      this.logger.error(`Password reset error for ${email}: ${error.message}`);
      throw new HttpException(
        error.message,
        error.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return await this.tokenService.verifyToken(token);
    } catch (error) {
      this.logger.error(`Token validation error: ${error.message}`);
      throw new HttpException(
        'Invalid token',
        HttpStatus.UNAUTHORIZED
      );
    }
  }
}