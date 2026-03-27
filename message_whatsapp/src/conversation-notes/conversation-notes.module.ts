import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConversationNote } from './entities/conversation-note.entity';
import { ConversationNotesService } from './conversation-notes.service';
import { ConversationNotesController } from './conversation-notes.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationNote, WhatsappCommercial]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ConversationNotesController],
  providers: [ConversationNotesService],
  exports: [ConversationNotesService],
})
export class ConversationNotesModule {}
