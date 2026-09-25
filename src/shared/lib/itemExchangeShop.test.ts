import { describe, expect, it } from 'vitest';
import {
  getItemExchangePurchaseWeek,
  isItemExchangeRealmEligible,
} from './itemExchangeShop';

describe('item exchange shop rules', () => {
  it('uses Monday as the Shanghai weekly boundary', () => {
    expect(
      getItemExchangePurchaseWeek(new Date('2026-07-26T15:59:59.999Z')),
    ).toBe('2026-07-20');
    expect(
      getItemExchangePurchaseWeek(new Date('2026-07-26T16:00:00.000Z')),
    ).toBe('2026-07-27');
  });

  it('applies inclusive realm gates', () => {
    expect(isItemExchangeRealmEligible('炼气', '炼气', null)).toBe(true);
    expect(isItemExchangeRealmEligible('筑基', '炼气', '筑基')).toBe(true);
    expect(isItemExchangeRealmEligible('金丹', '炼气', '筑基')).toBe(false);
    expect(isItemExchangeRealmEligible('炼气', '筑基', null)).toBe(false);
    expect(isItemExchangeRealmEligible('渡劫', '元婴', null)).toBe(true);
  });
});
