import { InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton } from 'telegraf/typings/core/types/typegram';

/** Callback data namespace: ui:<section>:<action>:<params> */
export const CB = {
  // Main menu
  main: 'ui:main',

  // Check flow
  check: 'ui:check',
  check_url: 'ui:check:url',

  // Top deals
  top: 'ui:top',
  top_limit: 'ui:top:limit',
  top_page: 'ui:top:page',

  // Best candidates
  best: 'ui:best',
  best_limit: 'ui:best:limit',
  best_page: 'ui:best:page',

  // Vehicle actions
  vehicle_why: 'ui:vehicle:why',
  vehicle_outcome: 'ui:vehicle:outcome',
  vehicle_open: 'ui:vehicle:open',

  // Settings
  settings: 'ui:settings',
  settings_notifications: 'ui:settings:notifications',
  settings_profiles: 'ui:settings:profiles',
  settings_blacklist: 'ui:settings:blacklist',
  settings_blacklist_show: 'ui:settings:blacklist:show',
  settings_blacklist_add: 'ui:settings:blacklist:add',
  settings_blacklist_remove: 'ui:settings:blacklist:remove',
  settings_blacklist_clear: 'ui:settings:blacklist:clear',
  settings_blacklist_profile: 'ui:settings:blacklist:profile',

  // Notifications
  notifications_enable: 'ui:notifications:enable',
  notifications_mute: 'ui:settings:notifications:mute',
  notifications_disable: 'ui:settings:notifications:disable',

  // Profiles
  profiles_list: 'ui:profiles:list',
  profiles_refresh: 'ui:profiles:refresh',

  // Dashboard
  dashboard: 'ui:dashboard',
  dashboard_report: 'ui:dashboard:report',
  dashboard_calibration: 'ui:dashboard:calibration',
  dashboard_weights: 'ui:dashboard:weights',
  dashboard_params: 'ui:dashboard:params',

  // Calibration
  calibration_run: 'ui:calibration:run',
  calibration_mode: 'ui:calibration:mode',

  // Weights
  weights_show: 'ui:weights:show',
  weights_apply: 'ui:weights:apply',

  // Params
  params_show: 'ui:params:show',

  // Blacklist wizard
  blacklist_select_profile: 'ui:blacklist:profile',
  blacklist_add_input: 'ui:blacklist:add:input',
  blacklist_remove_item: 'ui:blacklist:remove:item',

  // Outcome wizard
  outcome_select: 'ui:outcome:select',
  outcome_note_skip: 'ui:outcome:note:skip',
  outcome_note_add: 'ui:outcome:note:add',

  // Check flow
  check_progress: 'ui:check:progress',

  // Pagination
  page_prev: 'ui:page:prev',
  page_next: 'ui:page:next',

  // Generic
  back: 'ui:back',
  close: 'ui:close',
  ignore: 'ui:ignore',
} as const;

export type CallbackPrefix = typeof CB[keyof typeof CB];

/** Parse callback data into structured object */
export function parseCallback(data: string): { prefix: string; params: string[] } | null {
  const parts = data.split(':');
  if (parts.length < 2 || parts[0] !== 'ui') return null;
  return { prefix: parts.slice(0, 3).join(':'), params: parts.slice(3) };
}

/** Build callback data */
export function cb(prefix: string, ...params: string[]): string {
  return ['ui', prefix, ...params].join(':');
}

/** InlineKeyboard builder */
export class InlineKeyboard {
  public rows: InlineKeyboardButton[][] = [];

  row(...buttons: InlineKeyboardButton[]): this {
    this.rows.push(buttons);
    return this;
  }

  button(text: string, callbackData: string): this {
    const lastRow = this.rows[this.rows.length - 1];
    if (lastRow && lastRow.length < 3) {
      lastRow.push({ text, callback_data: callbackData });
    } else {
      this.rows.push([{ text, callback_data: callbackData }]);
    }
    return this;
  }

  urlButton(text: string, url: string): this {
    const lastRow = this.rows[this.rows.length - 1];
    if (lastRow && lastRow.length < 3) {
      lastRow.push({ text, url });
    } else {
      this.rows.push([{ text, url }]);
    }
    return this;
  }

  build(): InlineKeyboardMarkup {
    return { inline_keyboard: this.rows };
  }

  static single(text: string, callbackData: string): InlineKeyboardMarkup {
    return new InlineKeyboard().button(text, callbackData).build();
  }
}

/** ReplyKeyboard builder */
export class ReplyKeyboard {
  private rows: KeyboardButton[][] = [];
  private resize = true;
  private oneTime = false;

  row(...buttons: (string | KeyboardButton)[]): this {
    this.rows.push(
      buttons.map((b) => (typeof b === 'string' ? { text: b } : b))
    );
    return this;
  }

  requestContact(text: string): this {
    const lastRow = this.rows[this.rows.length - 1];
    const btn: KeyboardButton = { text, request_contact: true };
    if (lastRow && lastRow.length < 3) {
      lastRow.push(btn);
    } else {
      this.rows.push([btn]);
    }
    return this;
  }

  requestLocation(text: string): this {
    const lastRow = this.rows[this.rows.length - 1];
    const btn: KeyboardButton = { text, request_location: true };
    if (lastRow && lastRow.length < 3) {
      lastRow.push(btn);
    } else {
      this.rows.push([btn]);
    }
    return this;
  }

  setResize(resize: boolean): this {
    this.resize = resize;
    return this;
  }

  setOneTime(oneTime: boolean): this {
    this.oneTime = oneTime;
    return this;
  }

  build(): ReplyKeyboardMarkup {
    return {
      keyboard: this.rows,
      resize_keyboard: this.resize,
      one_time_keyboard: this.oneTime,
    };
  }
}

/** Main menu ReplyKeyboard */
export const MAIN_MENU_KEYBOARD = new ReplyKeyboard()
  .row('🚗 Check car', '🔥 Top deals')
  .row('📊 Dashboard', '⚙️ Settings')
  .setResize(true)
  .build();

/** Common button factories */
export const Buttons = {
  back: () => InlineKeyboard.single('⬅️ Back', cb('back')),
  close: () => InlineKeyboard.single('❌ Close', cb('close')),
  mainMenu: () => InlineKeyboard.single('🏠 Main menu', cb('main')),
  refresh: () => InlineKeyboard.single('🔄 Refresh', cb('refresh')),
} as const;

/** Pagination keyboard */
export function paginationKeyboard(
  currentPage: number,
  totalPages: number,
  baseCallback: string,
  extraRows?: InlineKeyboardButton[][]
): InlineKeyboardMarkup {
  const kb = new InlineKeyboard();

  if (totalPages <= 1) return kb.build();

  const navRow: InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    navRow.push({ text: '« Prev', callback_data: `${baseCallback}:${currentPage - 1}` });
  } else {
    navRow.push({ text: ' ', callback_data: cb('ignore') });
  }

  navRow.push({ text: `${currentPage} / ${totalPages}`, callback_data: cb('ignore') });

  if (currentPage < totalPages) {
    navRow.push({ text: 'Next »', callback_data: `${baseCallback}:${currentPage + 1}` });
  } else {
    navRow.push({ text: ' ', callback_data: cb('ignore') });
  }

  kb.row(...navRow);

  if (extraRows) {
    for (const row of extraRows) kb.row(...row);
  }

  return kb.build();
}

/** Limit selector keyboard */
export function limitKeyboard(
  currentLimit: number,
  limits: number[],
  baseCallback: string
): InlineKeyboardMarkup {
  const kb = new InlineKeyboard();

  for (const limit of limits) {
    const isCurrent = limit === currentLimit;
    kb.button(`${isCurrent ? '✅ ' : ''}${limit}`, `${baseCallback}:${limit}`);
  }

  kb.row(Buttons.back().inline_keyboard[0][0]);
  return kb.build();
}

/** Confirmation keyboard */
export function confirmKeyboard(
  confirmCallback: string,
  cancelCallback: string = cb('back'),
  confirmText = '✅ Confirm',
  cancelText = '❌ Cancel'
): InlineKeyboardMarkup {
  return new InlineKeyboard()
    .button(confirmText, confirmCallback)
    .button(cancelText, cancelCallback)
    .build();
}

/** Item list keyboard (for blacklist, profiles, etc.) */
export function itemListKeyboard<T>(
  items: T[],
  getText: (item: T) => string,
  getCallback: (item: T) => string,
  backCallback: string,
  emptyText = 'List is empty'
): InlineKeyboardMarkup {
  const kb = new InlineKeyboard();

  if (items.length === 0) {
    kb.button(emptyText, cb('ignore'));
  } else {
    for (const item of items) {
      kb.row({ text: getText(item), callback_data: getCallback(item) });
    }
  }

  kb.row({ text: '⬅️ Back', callback_data: backCallback });
  return kb.build();
}