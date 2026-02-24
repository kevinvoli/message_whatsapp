export interface FailedMessage {
  chatId: string;
  errorType: 'network' | 'timeout' | 'backend' | 'unknown';
  statusCode?: number;
  errorMessage: string;
  payload?: any;
  timestamp: number;
}
