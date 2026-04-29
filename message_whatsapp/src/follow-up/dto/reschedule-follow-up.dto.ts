import { IsISO8601 } from 'class-validator';

export class RescheduleFollowUpDto {
  @IsISO8601()
  scheduled_at: string;
}
