/** DI token for the outbound notification channel (Telegram adapter in v1). */
export const NOTIFIER = Symbol('NOTIFIER');

export interface OutboundButton {
  text: string;
  data: string;
}

export interface OutboundMessage {
  chatId: string;
  text: string;
  /** Inline keyboard rows (channel-agnostic); undefined = no buttons. */
  buttons?: OutboundButton[][];
}

/** Delivers messages to subscribers. Kept behind a port so the channel is swappable. */
export interface Notifier {
  readonly channel: string;
  send(message: OutboundMessage): Promise<void>;
}
