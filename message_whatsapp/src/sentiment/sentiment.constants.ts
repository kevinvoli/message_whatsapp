export const SENTIMENT_QUEUE = 'sentiment-analysis';

export interface SentimentJobPayload {
  messageId: string;
  text: string;
}
