import { EventEmitter } from 'events';

// Reduce noisy warnings during E2E where multiple app instances are created.
EventEmitter.defaultMaxListeners = 50;
