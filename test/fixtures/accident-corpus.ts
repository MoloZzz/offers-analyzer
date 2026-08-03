/**
 * Labelled uk+ru description corpus for the accident-severity classifier (spec 018, T001).
 *
 * This is the **measurement instrument** for SC-002 (zero `severe` cases classified below `severe`)
 * and SC-003 (no description-only claim of minor damage reaches `cosmetic` without corroboration),
 * so it is written before the classifier and labelled independently of it. TypeScript rather than
 * JSON so the labels are type-checked against the bucket union.
 *
 * `expected: null` means "no accident signal at all" — the classifier returns no verdict.
 */
import type {
  AccidentBucket,
  AccidentSeverityInput,
} from '../../src/modules/valuation/accident-severity';

export interface AccidentCase extends AccidentSeverityInput {
  /** Why this case is in the corpus — shown in the Jest case name. */
  note: string;
  expected: AccidentBucket | null;
  /**
   * True when the *only* damage evidence is the seller's own text claiming something minor. SC-003
   * asserts none of these reach `cosmetic` unless corroborated.
   */
  minorClaimFromTextOnly?: boolean;
}

/** Strips the labelling metadata, leaving exactly what the classifier accepts. */
export function toInput(c: AccidentCase): AccidentSeverityInput {
  return {
    description: c.description,
    damaged: c.damaged,
    salvage: c.salvage,
    vinChecked: c.vinChecked,
    hasVinReport: c.hasVinReport,
  };
}

export const ACCIDENT_CORPUS: AccidentCase[] = [
  // ---------------------------------------------------------------- severe: write-off / total loss
  {
    note: 'uk total loss',
    description: 'Авто тотал, продам як є, документи на руках',
    expected: 'severe',
  },
  {
    note: 'ru wrecked',
    description: 'Машина разбита полностью, восстановлению не подлежит',
    expected: 'severe',
  },
  {
    note: 'uk wrecked + accident adjective',
    description: 'Розбита аварійна машина, дешево',
    expected: 'severe',
  },
  {
    note: 'ru accident adjective',
    description: 'Аварийное состояние, продаю срочно',
    expected: 'severe',
  },

  // ------------------------------------------------------------------ severe: structural evidence
  {
    note: 'uk cut pillars — the case the whole spec exists for',
    description: 'Після ДТП заміна стійки, все зроблено якісно',
    expected: 'severe',
  },
  {
    note: 'ru replaced pillars',
    description: 'Были заменены стойки кузова, кузов ровный',
    expected: 'severe',
  },
  {
    note: 'uk roof replacement',
    description: 'Заміна даху після події, пофарбовано в колір',
    expected: 'severe',
  },
  {
    note: 'ru cut roof',
    description: 'Резаная крыша, но ездит отлично',
    expected: 'severe',
  },
  {
    note: 'uk longeron damage',
    description: 'Правий лонжерон тягнули, зараз все рівно',
    expected: 'severe',
  },
  {
    note: 'ru altered geometry',
    description: 'Нарушена геометрия кузова после удара',
    expected: 'severe',
  },
  {
    note: 'uk geometry disturbed',
    description: 'Порушена геометрія, тягнули на стапелі',
    expected: 'severe',
  },
  {
    note: 'uk deployed airbags',
    description: 'Подушки спрацювали, торпедо під заміну',
    expected: 'severe',
  },
  {
    note: 'ru deployed airbags',
    description: 'Подушки безопасности сработали, ремень заклинил',
    expected: 'severe',
  },
  {
    note: 'uk flood car',
    description: 'Авто утоплене, електрика робить дива',
    expected: 'severe',
  },
  {
    note: 'ru rollover',
    description: 'Машина перевернулась, крыша помята',
    expected: 'severe',
  },
  {
    note: 'uk «конструктор»',
    description: 'Конструктор, документи чисті, розмитнений',
    expected: 'severe',
  },
  {
    note: 'ru «распил»',
    description: 'Распил, собран аккуратно, ездит',
    expected: 'severe',
  },
  {
    note: 'uk «розпил»',
    description: 'Розпил, зварено професійно',
    expected: 'severe',
  },
  {
    note: 'ru head-on collision',
    description: 'Лобовое столкновение, перед восстановлен',
    expected: 'severe',
  },
  {
    note: 'severe from text alone while the AUTO.RIA bar is clean (spec edge case)',
    description: 'Лонжерон правий замінено, бар чистий',
    damaged: false,
    salvage: false,
    expected: 'severe',
  },
  {
    note: 'severe stays severe even with VIN corroboration — corroboration never lowers it',
    description: 'Заміна стійки, є звіт по VIN',
    vinChecked: true,
    expected: 'severe',
  },
  {
    note: 'salvage bar alone is a write-off',
    description: 'Продам авто, дзвоніть',
    salvage: true,
    expected: 'severe',
  },
  {
    note: 'salvage bar outranks a corroborated cosmetic text claim',
    description: 'Тільки подряпини на бампері',
    salvage: true,
    vinChecked: true,
    expected: 'severe',
  },

  // ------------------------------------------------- moderate: real bodywork, self-reported (→ floor)
  {
    note: 'uk wing replacement, uncorroborated',
    description: 'Заміна крила після невеликої події',
    expected: 'unknown',
    minorClaimFromTextOnly: true,
  },
  {
    note: 'uk wing replacement, corroborated by VIN check',
    description: 'Заміна крила після невеликої події',
    vinChecked: true,
    expected: 'moderate',
  },
  {
    note: 'ru door replacement + VIN report',
    description: 'Замена двери, все остальное родное',
    hasVinReport: true,
    expected: 'moderate',
  },
  {
    note: 'ru bodywork straightening, corroborated',
    description: 'Рихтовка заднего крыла, покрашено',
    vinChecked: true,
    expected: 'moderate',
  },
  {
    note: 'uk «бита» corroborated',
    description: 'Авто бите, відновлене, їздить добре',
    vinChecked: true,
    expected: 'moderate',
  },
  {
    note: 'ru «битая» uncorroborated stays at the floor',
    description: 'Битая, но всё восстановлено',
    expected: 'unknown',
    minorClaimFromTextOnly: true,
  },

  // ---------------------------------------------- cosmetic: only reachable with VIN corroboration
  {
    note: 'the operator-reported defect: «після ДТП замінено бампер» without VIN evidence',
    description: 'Після ДТП замінено бампер, більше нічого',
    expected: 'unknown',
    minorClaimFromTextOnly: true,
  },
  {
    note: 'the same description with VIN evidence',
    description: 'Після ДТП замінено бампер, більше нічого',
    vinChecked: true,
    expected: 'cosmetic',
  },
  {
    note: 'ru bumper replacement with a VIN report',
    description: 'После ДТП бампер заменен, больше ничего',
    hasVinReport: true,
    expected: 'cosmetic',
  },
  {
    note: 'uk scratches, uncorroborated',
    description: 'Є подряпини на дверях, дрібне ДТП',
    expected: 'unknown',
    minorClaimFromTextOnly: true,
  },
  {
    note: 'uk scratches, corroborated',
    description: 'Є подряпини на дверях, дрібне ДТП',
    vinChecked: true,
    expected: 'cosmetic',
  },
  {
    note: 'ru local paint with a VIN report',
    description: 'Локальная покраска крыла, царапины убраны',
    hasVinReport: true,
    expected: 'cosmetic',
  },
  {
    note: 'ru minor accident, corroborated',
    description: 'Мелкое ДТП, вмятина на двери',
    vinChecked: true,
    expected: 'cosmetic',
  },
  {
    note: 'cosmetic claim cannot beat the damage bar without corroboration',
    description: 'Тільки подряпини, дрібне ДТП',
    damaged: true,
    expected: 'unknown',
    minorClaimFromTextOnly: true,
  },

  // ------------------------------------------------------- unknown: disclosure without a severity
  {
    note: 'uk disclosure only — an accident happened, how bad is unstated',
    description: 'Авто після ДТП, все відновлено',
    expected: 'unknown',
  },
  {
    note: 'ru disclosure only',
    description: 'Машина после ДТП, восстановлена полностью',
    expected: 'unknown',
  },
  {
    note: 'ru disclosure only, even with a VIN report — corroboration does not invent a severity',
    description: 'Машина после ДТП, восстановлена полностью',
    hasVinReport: true,
    expected: 'unknown',
  },
  {
    note: 'uk participation disclosure',
    description: 'Брав участь у ДТП два роки тому',
    expected: 'unknown',
  },
  {
    note: 'damage bar + empty description',
    description: '',
    damaged: true,
    expected: 'unknown',
  },
  {
    note: 'damage bar + uninformative description',
    description: 'Дзвоніть, торг біля капота',
    damaged: true,
    expected: 'unknown',
  },
  {
    note: 'damage bar + missing description',
    damaged: true,
    expected: 'unknown',
  },

  // ---------------------------------------------------------------------- contradiction resolution
  {
    note: 'bar says damaged, text denies any accident → unknown, never cosmetic',
    description: 'Не бита, не крашена, все рідне',
    damaged: true,
    expected: 'unknown',
  },
  {
    note: 'bar says damaged, text denies, VIN checked → still unknown (denial is not a severity)',
    description: 'Не була у ДТП, все рідне',
    damaged: true,
    vinChecked: true,
    expected: 'unknown',
  },

  // ------------------------------------------------------------- negation: nothing may fire at all
  {
    note: 'uk explicit denial',
    description: 'Не був у ДТП, один власник, гаражне зберігання',
    expected: null,
  },
  {
    note: 'uk «без ДТП»',
    description: 'Без ДТП, без фарбування, все рідне',
    expected: null,
  },
  {
    note: 'ru «не бита, не крашена» — the condition.ts regression phrasing',
    description: 'Не бита, не крашена, вложений не требует',
    expected: null,
  },
  {
    note: 'ru «не аварийная»',
    description: 'Не аварийная, состояние отличное',
    expected: null,
  },
  {
    note: 'uk clean car, no accident vocabulary at all',
    description: 'Один власник, гаражне зберігання, все рідне',
    expected: null,
  },
  {
    note: 'empty description and a clean bar',
    description: '',
    expected: null,
  },
  {
    note: 'a clean bar with VIN corroboration still yields no verdict',
    description: 'Повністю обслужена, є звіт по VIN',
    vinChecked: true,
    expected: null,
  },
];
