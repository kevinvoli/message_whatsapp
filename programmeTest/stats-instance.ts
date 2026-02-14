import { FailedMessage } from './types.js';

export const stats = {
  sent: 0,
  networkAccepted: 0,
  networkFailed: 0,
  timeout: 0,
  statusCounts: {} as Record<string, number>,

  responses: [] as string[],
  failedMessages: [] as FailedMessage[],

  recordSuccess(res: any) {
    const status = res?.data?.status ?? 'unknown';
    const code = String(res?.status ?? 'unknown');
    this.responses.push(status);
    this.statusCounts[code] = (this.statusCounts[code] ?? 0) + 1;
    this.networkAccepted++;
  },

  recordFailure(error: any, payload: any) {
    const errorType = this.detectErrorType(error);

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
    const okResponses = this.responses.filter(s => s === 'ok' || s === 'EVENT_RECEIVED').length;

    return {
      total: this.sent,
      networkAccepted: this.networkAccepted,
      networkFailed: this.networkFailed,
      timeout: this.timeout,
      okResponses,
      failedToStore: this.networkAccepted - okResponses,
      statusCounts: this.statusCounts,
    };
  },
};
