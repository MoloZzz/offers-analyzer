/**
 * Human-readable Ukrainian labels for red-flag codes.
 *
 * Own module rather than a member of `opportunity-message`: the shared breakdown builder needs them
 * too, and having the alert formatter own them would make the builder import the formatter it
 * exists to feed.
 */
export const FLAG_LABELS: Record<string, string> = {
  suspicious_discount: 'підозріло дешево',
  damaged: 'була в ДТП',
  salvage: 'на запчастини',
  confiscated: 'конфіскат',
  under_credit: 'під кредитом',
  unclear_customs: 'нерозмитнена',
  abroad: 'за кордоном',
  no_vin_report: 'немає VIN-звіту',
  desc_after_accident: 'опис: після ДТП',
  desc_not_running: 'опис: не на ходу / на запчастини',
  desc_needs_repair: 'опис: потребує ремонту',
  desc_mechanical_issue: 'опис: проблеми з двигуном/КПП',
  suspicious_low_mileage: 'підозріло малий пробіг для віку',
  unverified_bargain: 'завелика знижка без VIN-перевірки',
};
