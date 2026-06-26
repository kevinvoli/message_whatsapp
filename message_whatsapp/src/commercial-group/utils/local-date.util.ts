export function getTodayLocalString(tz: string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(new Date());
}

export function nowLocal(tz: string): Date {
  return new Date(getTodayLocalString(tz) + 'T00:00:00');
}
