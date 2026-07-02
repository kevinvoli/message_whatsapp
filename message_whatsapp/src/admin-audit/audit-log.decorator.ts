import { AdminAuditService } from './admin-audit.service';

export interface AuditLogOptions {
  action: string;
  targetEntity: string;
  targetIdExtractor?: (args: unknown[]) => string | null;
}

interface AuditLogContext {
  auditService?: AdminAuditService;
  logger?: { warn(message: string): void };
}

interface RequestLike {
  user?: { userId?: string; id?: string; sub?: string };
}

function findExpressRequest(args: unknown[]): RequestLike | null {
  for (const arg of args) {
    if (
      arg !== null &&
      typeof arg === 'object' &&
      ('headers' in arg || 'cookies' in arg)
    ) {
      return arg as RequestLike;
    }
  }
  return null;
}

function buildPayload(args: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const arg of args) {
    if (arg !== null && typeof arg === 'object') {
      if ('headers' in arg || 'cookies' in arg) {
        continue;
      }
      Object.assign(result, arg as Record<string, unknown>);
    }
  }
  return result;
}

export function AuditLog(options: AuditLogOptions): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (
      this: AuditLogContext,
      ...args: unknown[]
    ): Promise<unknown> {
      const result = await original.apply(this, args);

      if (this.auditService) {
        const req = findExpressRequest(args);
        const user = req?.user;
        const adminId = user?.userId ?? user?.id ?? user?.sub ?? 'unknown';
        const targetId = options.targetIdExtractor ? options.targetIdExtractor(args) : null;
        const payload = buildPayload(args);

        this.auditService
          .log(adminId, options.action, options.targetEntity, targetId, payload)
          .catch((err: unknown) => {
            this.logger?.warn(
              `[AuditLog] Failed to record ${options.action}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      return result;
    };

    return descriptor;
  };
}
