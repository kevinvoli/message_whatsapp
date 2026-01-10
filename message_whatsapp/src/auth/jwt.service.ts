import { 
  BadRequestException, 
  HttpException, 
  HttpStatus, 
  Injectable,
  Logger 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from './entities/token.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './interface/payload.interface';
import { CreateUserDto } from '../users/dto/create-users.dto';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly ACCESS_TOKEN_EXPIRY = '7d';
  private readonly REFRESH_TOKEN_EXPIRY = '15d';

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateConfirmationToken(data: CreateUserDto): Promise<string> {
    try {
      return this.jwtService.sign(
        { email: data.email },
        {
          secret: this.configService.get('JWT_CONFIRMATION_SECRET'),
          expiresIn: '24h' // Durée plus courte pour la confirmation
        }
      );
    } catch (error) {
      this.logger.error(`Confirmation token error: ${error.message}`);
      throw new HttpException(
        'Could not generate confirmation token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getAccessToken(payload: JwtPayload): Promise<string> {
    try {
      return await this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_ACCESS_TOKEN_SECRET'),
        expiresIn: this.ACCESS_TOKEN_EXPIRY
      });
    } catch (error) {
      this.logger.error(`Access token generation error: ${error.message}`);
      throw new HttpException(
        'Could not generate access token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getRefreshToken(payload: JwtPayload): Promise<string> {
    try {
      return await this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_TOKEN_SECRET'),
        expiresIn: this.REFRESH_TOKEN_EXPIRY
      });
    } catch (error) {
      this.logger.error(`Refresh token generation error: ${error.message}`);
      throw new HttpException(
        'Could not generate refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async updateRefreshTokenInUser(tokenData: Partial<Token>, userId: number): Promise<Token> {
    try {
      let userToken = await this.tokenRepository.findOne({ where: { userId } });

      if (!userToken) {
        userToken = this.tokenRepository.create({
          userId,
          accessToken: tokenData.accessToken,
          refreshToken: await this.hashRefreshToken(tokenData.refreshToken),
          role: tokenData.role
        });
      } else {
        userToken.accessToken = tokenData.accessToken;
        userToken.refreshToken = await this.hashRefreshToken(tokenData.refreshToken);
      }

      return await this.tokenRepository.save(userToken);
    } catch (error) {
      this.logger.error(`Update refresh token error: ${error.message}`);
      throw new HttpException(
        'Could not update refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async hashRefreshToken(refreshToken?: string): Promise<string> {
    return bcrypt.hash(refreshToken, 10);
  }

  async rotateTokens(payload: JwtPayload): Promise<{ 
    accessToken: string; 
    refreshToken: string 
  }> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.getAccessToken(payload),
        this.getRefreshToken(payload)
      ]);

      await this.updateRefreshTokenInUser(
        { accessToken, refreshToken, role: payload.role },
        payload.id
      );

      return { accessToken, refreshToken };
    } catch (error) {
      this.logger.error(`Token rotation error: ${error.message}`);
      throw new HttpException(
        'Could not rotate tokens',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async verifyToken(token: string, isRefreshToken = false): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: isRefreshToken 
          ? this.configService.get('JWT_REFRESH_TOKEN_SECRET')
          : this.configService.get('JWT_ACCESS_TOKEN_SECRET'),
      });
    } catch (error) {
      this.logTokenVerificationError(error);
      if (error instanceof TokenExpiredError) {
        throw new HttpException('Token expired', HttpStatus.UNAUTHORIZED);
      }
      if (error instanceof JsonWebTokenError) {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        'Token verification failed',
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  private logTokenVerificationError(error: any): void {
    this.logger.error(`Token verification error: ${error.message}`, error.stack);
  }

  async findTokenByUserId(userId: number): Promise<Token | null> {
    try {
      return await this.tokenRepository.findOne({ 
        where: { userId },
        relations: ['user']
      });
    } catch (error) {
      this.logger.error(`Find token error: ${error.message}`);
      throw new HttpException(
        'Could not find token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async invalidateTokens(userId: number): Promise<void> {
    try {
      await this.tokenRepository.delete({ userId });
    } catch (error) {
      this.logger.error(`Token invalidation error: ${error.message}`);
      throw new HttpException(
        'Could not invalidate tokens',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async validateRefreshToken(userId: number, refreshToken: string): Promise<boolean> {
    try {
      const tokenEntity = await this.findTokenByUserId(userId);
      if (!tokenEntity || !tokenEntity.refreshToken) return false;

      return bcrypt.compare(refreshToken, tokenEntity.refreshToken);
    } catch (error) {
      this.logger.error(`Refresh token validation error: ${error.message}`);
      return false;
    }
  }
}