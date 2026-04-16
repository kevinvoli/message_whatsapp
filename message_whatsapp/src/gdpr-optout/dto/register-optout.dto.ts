import { OptOutReason } from '../entities/gdpr-optout.entity';

export class RegisterOptOutDto {
  tenant_id: string;
  phone_number: string;
  reason?: OptOutReason;
  notes?: string | null;
  registered_by?: string | null;
}
