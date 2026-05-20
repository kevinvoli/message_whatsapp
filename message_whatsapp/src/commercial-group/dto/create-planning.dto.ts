export type TimeSlot = 'full' | 'morning' | 'afternoon';

export class CreateAbsenceDto {
  commercialId: string;
  date: string;
  reason?: string;
  declaredBy?: string;
  timeSlot?: TimeSlot;
}

export class CreateAbsenceRangeDto {
  commercialId: string;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;   // YYYY-MM-DD (>= dateStart)
  reason?: string;
  declaredBy?: string;
  timeSlot?: TimeSlot;
}

export class CreateExceptionalDto {
  commercialId: string;
  date: string;
  reason?: string;
  declaredBy?: string;
}

export class CreateReplacementDto {
  replacedId: string;
  replacerId: string;
  date: string;
  reason?: string;
  declaredBy?: string;
}

export class CreateSelfAbsenceDto {
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;   // YYYY-MM-DD (>= dateStart)
  reason?: string;
  timeSlot?: TimeSlot;
}
