export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  PLAYED = 'played',
  FAILED = 'failed',
  DELETED = 'deleted',
}

/** Ordre de progression des statuts (index croissant = plus avancé) */
const STATUS_ORDER: MessageStatus[] = [
  MessageStatus.PENDING,
  MessageStatus.SENT,
  MessageStatus.DELIVERED,
  MessageStatus.READ,
  MessageStatus.PLAYED,
];

export function isStatusProgression(
  from: MessageStatus,
  to: MessageStatus,
): boolean {
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return true; // FAILED / DELETED : toujours autorisé
  return toIdx > fromIdx;
}
