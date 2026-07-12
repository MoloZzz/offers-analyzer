/** DI token for the outbound notification channel (Telegram adapter in v1). */
export const NOTIFIER = Symbol('NOTIFIER');

export interface OutboundMessage {
  chatId: string;
  text: string;
}

/** Delivers messages to subscribers. Kept behind a port so the channel is swappable. */
export interface Notifier {
  readonly channel: string;
  send(message: OutboundMessage): Promise<void>;
}
