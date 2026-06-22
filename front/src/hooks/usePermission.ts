import { useAuth } from '@/contexts/AuthProvider';

/**
 * Vérifie si l'utilisateur courant possède la permission donnée.
 * Si rbacEnabled = false, retourne toujours true (aucune restriction).
 */
export function usePermission(permission: string): boolean {
  const { user } = useAuth();
  if (!user?.rbacEnabled) return true;
  return user.permissions.includes(permission);
}
