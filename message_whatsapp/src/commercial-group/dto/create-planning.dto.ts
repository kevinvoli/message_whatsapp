export class CreateAbsenceDto {
  commercialId: string;
  date: string;
  reason?: string;
  declaredBy?: string;
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
