import { EventEmitter } from 'events';

// Reduce noisy warnings during E2E where multiple app instances are created.
EventEmitter.defaultMaxListeners = 50;

if (process.env.E2E_RUN === 'true') {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
}
