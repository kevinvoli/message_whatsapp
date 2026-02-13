import { forwardRef, Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';

@Module({
   imports: [
      TypeOrmModule.forFeature([
        Contact
      ]),
      forwardRef(() => WhatsappMessageModule),
    ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
