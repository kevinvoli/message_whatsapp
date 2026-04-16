import { FieldType } from '../entities/contact-field-definition.entity';

export class CreateFieldDefinitionDto {
  tenant_id: string;
  name: string;
  field_key: string;
  field_type?: FieldType;
  options?: string[] | null;
  required?: boolean;
  position?: number;
}

export class UpdateFieldDefinitionDto {
  name?: string;
  options?: string[] | null;
  required?: boolean;
  position?: number;
}

export class SetContactFieldValuesDto {
  /** tableau { field_key, value } */
  values: Array<{
    field_key: string;
    value: string | number | boolean | string[] | null;
  }>;
}
