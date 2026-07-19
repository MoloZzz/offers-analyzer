import { Context } from 'telegraf';

/** Session data stored in context */
export interface BotSession {
  /** Current wizard state */
  wizard?: WizardState;
  /** Last message ID for editing */
  lastMessageId?: number;
  /** User preferences */
  preferences?: UserPreferences;
}

export interface WizardState {
  name: string;
  step: number;
  data: Record<string, any>;
  startedAt: number;
}

export interface UserPreferences {
  defaultLimit?: number;
  language?: 'uk' | 'ru' | 'en';
  notifications?: boolean;
}

/** Wizard context extension */
export interface WizardContext extends Context {
  session: BotSession;
  wizard?: {
    state: WizardState;
    next: () => Promise<void>;
    back: () => Promise<void>;
    cancel: () => Promise<void>;
    selectStep: (step: number) => Promise<void>;
    updateData: (data: Record<string, any>) => void;
  };
}

/** Wizard definition */
export interface WizardDefinition {
  name: string;
  steps: WizardStepHandler[];
  onCancel?: (ctx: WizardContext) => Promise<void>;
  onComplete?: (ctx: WizardContext) => Promise<void>;
}

/** Wizard step handler */
export type WizardStepHandler = (ctx: WizardContext) => Promise<void>;

/** Wizard manager */
export class WizardManager {
  private wizards = new Map<string, WizardDefinition>();

  register(wizard: WizardDefinition): void {
    this.wizards.set(wizard.name, wizard);
  }

  get(name: string): WizardDefinition | undefined {
    return this.wizards.get(name);
  }

  async enter(ctx: WizardContext, name: string, initialData: Record<string, any> = {}): Promise<void> {
    const wizard = this.wizards.get(name);
    if (!wizard) throw new Error(`Wizard ${name} not found`);

    const state: WizardState = {
      name,
      step: 0,
      data: initialData,
      startedAt: Date.now(),
    };

    ctx.session = ctx.session || {};
    ctx.session.wizard = state;

    const wizardHelpers = {
      state,
      next: async () => this.next(ctx),
      back: async () => this.back(ctx),
      cancel: async () => this.cancel(ctx),
      selectStep: async (step: number) => this.selectStep(ctx, step),
      updateData: (data: Record<string, any>) => this.updateData(ctx, data),
    };

    // @ts-ignore - extending context
    ctx.wizard = wizardHelpers;

    await wizard.steps[0](ctx);
  }

  async next(ctx: WizardContext): Promise<void> {
    if (!ctx.wizard) return;
    const { state } = ctx.wizard;
    const wizard = this.wizards.get(state.name);
    if (!wizard) return;

    if (state.step + 1 >= wizard.steps.length) {
      await this.complete(ctx);
      return;
    }

    state.step++;
    await wizard.steps[state.step](ctx);
  }

  async back(ctx: WizardContext): Promise<void> {
    if (!ctx.wizard) return;
    const { state } = ctx.wizard;
    if (state.step === 0) {
      await this.cancel(ctx);
      return;
    }

    state.step--;
    const wizard = this.wizards.get(state.name);
    if (wizard) {
      await wizard.steps[state.step](ctx);
    }
  }

  async cancel(ctx: WizardContext): Promise<void> {
    if (!ctx.wizard) return;
    const { state } = ctx.wizard;
    const wizard = this.wizards.get(state.name);

    if (wizard?.onCancel) {
      await wizard.onCancel(ctx);
    }

    if (ctx.session) {
      ctx.session.wizard = undefined;
    }
    // @ts-ignore
    ctx.wizard = undefined;
  }

  async complete(ctx: WizardContext): Promise<void> {
    if (!ctx.wizard) return;
    const { state } = ctx.wizard;
    const wizard = this.wizards.get(state.name);

    if (wizard?.onComplete) {
      await wizard.onComplete(ctx);
    }

    if (ctx.session) {
      ctx.session.wizard = undefined;
    }
    // @ts-ignore
    ctx.wizard = undefined;
  }

  async selectStep(ctx: WizardContext, step: number): Promise<void> {
    if (!ctx.wizard) return;
    const { state } = ctx.wizard;
    const wizard = this.wizards.get(state.name);
    if (!wizard || step < 0 || step >= wizard.steps.length) return;

    state.step = step;
    await wizard.steps[step](ctx);
  }

  private updateData(ctx: WizardContext, data: Record<string, any>): void {
    if (ctx.wizard) {
      ctx.wizard.state.data = { ...ctx.wizard.state.data, ...data };
    }
  }
}

/** Middleware to inject wizard into context */
export function wizardMiddleware() {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.session?.wizard) {
      ctx.wizard = {
        state: ctx.session.wizard,
        next: async () => {},
        back: async () => {},
        cancel: async () => {},
        selectStep: async () => {},
        updateData: (data: Record<string, any>) => {
          if (ctx.session?.wizard) {
            ctx.session.wizard.data = { ...ctx.session.wizard.data, ...data };
          }
        },
      };
    }
    await next();
  };
}

/** Helper to create a simple input step */
export function createInputStep(
  prompt: string,
  key: string,
  validator?: (input: string) => string | null,
  _keyboard?: any
): WizardStepHandler {
  return async (ctx: any) => {
    const { state } = ctx.wizard || { state: { data: {} } };
    const existing = state.data[key];

    if (ctx.message && 'text' in ctx.message) {
      const input = ctx.message.text;

      if (validator) {
        const error = validator(input);
        if (error) {
          await ctx.reply(`${error}\n\n${prompt}`);
          return;
        }
      }

      state.data[key] = input;
      await ctx.wizard?.next();
      return;
    }

    if (existing) {
      await ctx.reply(`${prompt}\n\nCurrent: ${existing}`);
    } else {
      await ctx.reply(prompt);
    }
  };
}

/** Helper to create a selection step */
export function createSelectStep<T>(
  prompt: string,
  key: string,
  options: { text: string; value: T }[],
  _keyboard?: any
): WizardStepHandler {
  return async (ctx: any) => {
    const { state } = ctx.wizard || { state: { data: {} } };

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      const option = options.find((o) => String(o.value) === data);
      if (option) {
        state.data[key] = option.value;
        await ctx.wizard?.next();
        return;
      }
    }

    const { InlineKeyboard } = await import('./keyboards');
    const kb = new InlineKeyboard();
    for (const opt of options) {
      const isSelected = state.data[key] === opt.value;
      kb.button(`${isSelected ? '✅ ' : ''}${opt.text}`, String(opt.value));
    }
    kb.row({ text: '⬅️ Back', callback_data: 'wizard:back' });

    await ctx.reply(prompt, kb.build());
  };
}

/** Helper to create a confirmation step */
export function createConfirmStep(
  prompt: string,
  key: string,
  onConfirm: (ctx: any) => Promise<void>,
  _keyboard?: any
): WizardStepHandler {
  return async (ctx: any) => {
    const { state } = ctx.wizard || { state: { data: {} } };

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      if (data === 'confirm:yes') {
        state.data[key] = true;
        await onConfirm(ctx);
        return;
      }
      if (data === 'confirm:no') {
        state.data[key] = false;
        await ctx.wizard?.next();
        return;
      }
    }

    const { InlineKeyboard } = await import('./keyboards');
    const kb = new InlineKeyboard()
      .button('✅ Confirm', 'confirm:yes')
      .button('❌ Cancel', 'confirm:no')
      .build();

    await ctx.reply(prompt, kb);
  };
}

/** Helper to create a summary step */
export function createSummaryStep(
  getSummary: (data: Record<string, any>) => string,
  onConfirm?: (ctx: any) => Promise<void>
): WizardStepHandler {
  return async (ctx: any) => {
    const { state } = ctx.wizard || { state: { data: {} } };
    const summary = getSummary(state.data);

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      if (data === 'summary:confirm') {
        if (onConfirm) await onConfirm(ctx);
        return;
      }
      if (data === 'summary:edit') {
        state.step = 0;
        await ctx.wizard?.next();
        return;
      }
    }

    const { InlineKeyboard } = await import('./keyboards');
    const kb = new InlineKeyboard()
      .button('✅ Confirm', 'summary:confirm')
      .button('✏️ Edit', 'summary:edit')
      .row({ text: '❌ Cancel', callback_data: 'wizard:cancel' });

    await ctx.reply(summary, kb.build());
  };
}

/** Format wizard progress indicator */
export function formatProgress(current: number, total: number): string {
  const filled = '█';
  const empty = '░';
  const bar = filled.repeat(current) + empty.repeat(total - current);
  return `${bar} ${current}/${total}`;
}