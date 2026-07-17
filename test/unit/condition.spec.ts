import { assessCondition } from '../../src/modules/valuation/condition';

describe('assessCondition (description → condition signals)', () => {
  it('returns all-false for empty or clean descriptions', () => {
    expect(assessCondition(undefined)).toEqual({
      afterAccident: false,
      notRunning: false,
      needsRepair: false,
      mechanicalIssue: false,
    });
    expect(assessCondition('Один власник, гаражне зберігання, все рідне.').afterAccident).toBe(false);
  });

  it('flags after-accident wording (uk + ru)', () => {
    expect(assessCondition('Авто після ДТП, відновлене').afterAccident).toBe(true);
    expect(assessCondition('Машина была в аварии, разбита').afterAccident).toBe(true);
  });

  it('flags non-runner / for-parts wording', () => {
    expect(assessCondition('Не на ходу, продам на запчастини').notRunning).toBe(true);
    expect(assessCondition('не заводится, под восстановление').notRunning).toBe(true);
  });

  it('flags needs-repair only when NOT negated', () => {
    expect(assessCondition('Потребує ремонту двигуна').needsRepair).toBe(true);
    expect(assessCondition('требует ремонта и покраски').needsRepair).toBe(true);
    // common positive phrasings must NOT fire
    expect(assessCondition('Авто в ідеальному стані, вкладень не потребує').needsRepair).toBe(false);
    expect(assessCondition('Отличное состояние, вложений не требует').needsRepair).toBe(false);
    expect(assessCondition('не потребує ремонту, все зроблено').needsRepair).toBe(false);
  });

  it('flags mechanical issues but not "після капремонту" / negated', () => {
    expect(assessCondition('троит двигун, потрібен капремонт').mechanicalIssue).toBe(true);
    expect(assessCondition('Двигун після капремонту, все добре').mechanicalIssue).toBe(false);
    expect(assessCondition('без стуків, двигун ідеальний').mechanicalIssue).toBe(false);
  });

  it('does not flag a clean "не бита, не крашена" car', () => {
    const c = assessCondition('Не бита, не крашена, вкладень не потребує');
    expect(c.afterAccident).toBe(false);
    expect(c.needsRepair).toBe(false);
    expect(c.notRunning).toBe(false);
  });
});
