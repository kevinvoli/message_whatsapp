export interface CommercialPresenceDto {
  id: string;
  name: string;
  phone: string | null;
  isWorkingToday: boolean;
  workingTodaySince: Date | null;
  groupId: string | null;
  poste: { id: string; name: string; code: string } | null;
}
