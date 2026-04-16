export class CreateLabelDto {
  tenant_id: string;
  name: string;
  color?: string;
  description?: string | null;
}
