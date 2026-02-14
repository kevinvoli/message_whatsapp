import { FailedMessage } from './types.js';

export const stats = {
  sent: 0,
  networkAccepted: 0,
  networkFailed: 0,
  timeout: 0,

  responses: [] as string[],
  failedMessages: [] as FailedMessage[],

  recordSuccess(res: any) {
    this.responses.push(res.data?.status || 'unknown');
    this.networkAccepted++;
  },

  recordFailure(error: any, payload: any) {
    const errorType = this.detectErrorType(error);
console.log("=====", error);

    const failed: FailedMessage = {
      chatId: payload?.messages?.[0]?.chat_id ?? 'unknown',
      errorType,
      statusCode: error?.statusCode,
      errorMessage:
        error?.response?.data?.message ||
        error?.message ||
        'Erreur inconnue',
      payload,
      timestamp: Date.now(),
    };

    this.failedMessages.push(failed);

    // 🔥 compteurs cohérents
    if (errorType === 'timeout') {
      this.timeout++;
    } else if (errorType === 'network') {
      this.networkFailed++;
    }
  },

  detectErrorType(error: any): FailedMessage['errorType'] {
    if (error?.code === 'ECONNABORTED') return 'timeout';
    if (!error?.response) return 'network';
    if (error.response.status >= 400) return 'backend';
    return 'unknown';
  },

  summary() {
    const actuallyStored = this.responses.filter(s => s === 'ok').length;

    return {
      total: this.sent,
      networkAccepted: this.networkAccepted,
      networkFailed: this.networkFailed,
      timeout: this.timeout,
      actuallyStored,
      failedToStore: this.networkAccepted - actuallyStored,
    };
  },
};
