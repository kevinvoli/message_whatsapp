import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContactFieldDefinition,
  FieldType,
} from './entities/contact-field-definition.entity';
import { ContactFieldValue } from './entities/contact-field-value.entity';
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
  SetContactFieldValuesDto,
} from './dto/crm.dto';

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(ContactFieldDefinition)
    private readonly defRepo: Repository<ContactFieldDefinition>,

    @InjectRepository(ContactFieldValue)
    private readonly valRepo: Repository<ContactFieldValue>,
  ) {}

  // ─── Définitions ─────────────────────────────────────────────────────────────

  async createDefinition(dto: CreateFieldDefinitionDto): Promise<ContactFieldDefinition> {
    const existing = await this.defRepo.findOne({
      where: { tenant_id: dto.tenant_id, field_key: dto.field_key },
    });
    if (existing) {
      throw new ConflictException(`Champ "${dto.field_key}" existe déjà pour ce tenant`);
    }
    return this.defRepo.save(this.defRepo.create(dto));
  }

  async findAllDefinitions(tenantId: string): Promise<ContactFieldDefinition[]> {
    return this.defRepo.find({
      where: { tenant_id: tenantId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async updateDefinition(
    id: string,
    tenantId: string,
    dto: UpdateFieldDefinitionDto,
  ): Promise<ContactFieldDefinition> {
    const def = await this.defRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!def) throw new NotFoundException(`Champ ${id} introuvable`);
    Object.assign(def, dto);
    return this.defRepo.save(def);
  }

  async removeDefinition(id: string, tenantId: string): Promise<void> {
    const def = await this.defRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!def) throw new NotFoundException(`Champ ${id} introuvable`);
    // Cascade supprime les valeurs associées (FK ON DELETE CASCADE)
    await this.defRepo.delete(def.id);
  }

  // ─── Valeurs ─────────────────────────────────────────────────────────────────

  async getContactFields(
    contactId: string,
    tenantId: string,
  ): Promise<Array<{ definition: ContactFieldDefinition; value: ContactFieldValue | null }>> {
    const definitions = await this.findAllDefinitions(tenantId);
    const values = await this.valRepo.find({ where: { contact_id: contactId } });
    const valMap = new Map(values.map((v) => [v.field_id, v]));

    return definitions.map((def) => ({
      definition: def,
      value: valMap.get(def.id) ?? null,
    }));
  }

  async setContactFields(
    contactId: string,
    tenantId: string,
    dto: SetContactFieldValuesDto,
  ): Promise<void> {
    const definitions = await this.findAllDefinitions(tenantId);
    const defMap = new Map(definitions.map((d) => [d.field_key, d]));

    for (const { field_key, value } of dto.values) {
      const def = defMap.get(field_key);
      if (!def) continue;

      let entity = await this.valRepo.findOne({
        where: { contact_id: contactId, field_id: def.id },
      });

      if (!entity) {
        entity = this.valRepo.create({ contact_id: contactId, field_id: def.id });
      }

      // Réinitialiser toutes les colonnes de valeur
      entity.value_text = null;
      entity.value_number = null;
      entity.value_date = null;
      entity.value_boolean = null;
      entity.value_json = null;

      switch (def.field_type) {
        case FieldType.TEXT:
        case FieldType.SELECT:
          entity.value_text = value != null ? String(value) : null;
          break;
        case FieldType.NUMBER:
          entity.value_number = value != null ? Number(value) : null;
          break;
        case FieldType.DATE:
          entity.value_date = value != null ? String(value) : null;
          break;
        case FieldType.BOOLEAN:
          entity.value_boolean = value != null ? (value ? 1 : 0) : null;
          break;
        case FieldType.MULTISELECT:
          entity.value_json = Array.isArray(value) ? value : null;
          break;
      }

      await this.valRepo.save(entity);
    }
  }
}
