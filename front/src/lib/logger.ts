type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LEVEL: LogLevel =
  process.env.NODE_ENV === 'production' ? 'warn' : 'debug';

const configuredLevel =
  (process.env.NEXT_PUBLIC_LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ??
  DEFAULT_LEVEL;

const minLevel = LEVELS[configuredLevel] ?? LEVELS[DEFAULT_LEVEL];

const REDACT_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'jwt',
]);

const MAX_DEPTH = 4;

function shouldLog(level: LogLevel) {
  return LEVELS[level] >= minLevel;
}

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[REDACTED_DEPTH]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (REDACT_KEYS.has(key.toLowerCase())) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redact(val, depth + 1);
      }
    }
    return output;
  }
  return value;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) {
    return;
  }
  const payload = meta ? redact(meta) : undefined;
  const output = payload ? { message, ...payload } : message;
  switch (level) {
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    emit('error', message, meta),
};
