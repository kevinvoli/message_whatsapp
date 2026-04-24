import { forwardRef, Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CallLogModule } from 'src/call-log/call_log.module';
import { BusinessMenuService } from './business-menu.service';
import { OrderReadModule } from 'src/order-read/order-read.module';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, WhatsappCommercial, CommercialIdentityMapping]),
    forwardRef(() => WhatsappMessageModule),
    CallLogModule,
    OrderReadModule,
  ],
  controllers: [ContactController],
  providers: [ContactService, BusinessMenuService],
  exports: [ContactService, BusinessMenuService],
})
export class ContactModule {}
