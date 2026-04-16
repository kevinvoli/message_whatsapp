import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactFieldDefinition } from './entities/contact-field-definition.entity';
import { ContactFieldValue } from './entities/contact-field-value.entity';
import { CrmService } from './crm.service';
import {
  CrmAdminController,
  CrmAgentController,
  CrmAdminFieldsController,
} from './crm.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactFieldDefinition, ContactFieldValue]),
  ],
  providers: [CrmService],
  controllers: [CrmAdminController, CrmAgentController, CrmAdminFieldsController],
  exports: [CrmService],
})
export class CrmModule {}
