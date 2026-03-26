import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CallLogModule } from 'src/call-log/call_log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, WhatsappCommercial]),
    CallLogModule,
  ],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
