export class UpsertDossierDto {
  fullName?: string | null;
  ville?: string | null;
  commune?: string | null;
  quartier?: string | null;
  otherPhones?: string | null;
  productCategory?: string | null;
  clientNeed?: string | null;
  interestScore?: number | null;
  isMaleNotInterested?: boolean;
  followUpAt?: string | Date | null;
  nextAction?: string | null;
  notes?: string | null;
}
