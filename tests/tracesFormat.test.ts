import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import i18n from '@/i18n';
import {
  durationParts,
  formatBytes,
  formatCompact,
  formatCount,
  formatPercentValue,
  formatShare,
  formatUsd,
  formatUsdPrice,
  formatUsdTick,
  hoursValue,
  relativeChange,
  shortId,
} from '../src/features/traces/format';

describe('traces money formatting', () => {
  test('shows cents below $100 and whole dollars above', () => {
    expect(formatUsd(0, 'en')).toBe('$0.00');
    expect(formatUsd(12.345, 'en')).toBe('$12.35');
    expect(formatUsd(99.994, 'en')).toBe('$99.99');
    expect(formatUsd(1234.5, 'en')).toBe('$1,235');
  });

  test('never shows a tiny non-zero amount as free', () => {
    expect(formatUsd(0.004, 'en')).toBe('<$0.01');
    expect(formatUsd(-0.004, 'en')).toBe('<-$0.01');
  });

  test('axis ticks are compact for large values', () => {
    expect(formatUsdTick(0, 'en')).toBe('$0');
    expect(formatUsdTick(2.5, 'en')).toBe('$2.50');
    expect(formatUsdTick(250, 'en')).toBe('$250');
    expect(formatUsdTick(25_000, 'en')).toBe('$25K');
  });

  test('prices per 1M tokens keep up to four decimals', () => {
    expect(formatUsdPrice(0.125, 'en')).toBe('$0.125');
    expect(formatUsdPrice(3, 'en')).toBe('$3.00');
    expect(formatUsdPrice(0.0375, 'en')).toBe('$0.0375');
  });

  test('uses the locale for grouping', () => {
    expect(formatUsd(1234.5, 'ru')).toContain('1');
    expect(formatUsd(1234.5, 'ru')).not.toBe(formatUsd(1234.5, 'en'));
  });
});

describe('traces number formatting', () => {
  test('counts and compact token totals', () => {
    expect(formatCount(1942, 'en')).toBe('1,942');
    expect(formatCompact(999, 'en')).toBe('999');
    expect(formatCompact(684_200_000, 'en')).toBe('684.2M');
    expect(formatCompact(9_400_000, 'en')).toBe('9.4M');
  });

  test('shares keep one decimal below 10%', () => {
    expect(formatShare(0.91, 'en')).toBe('91%');
    expect(formatShare(0.019, 'en')).toBe('1.9%');
    expect(formatShare(0, 'en')).toBe('0%');
    expect(formatPercentValue(87, 'en')).toBe('87%');
  });

  test('bytes use binary units', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(184_320_000, 'en')).toBe('175.8 MB');
  });

  test('relative change needs a non-zero previous value', () => {
    expect(relativeChange(112, 100)).toBeCloseTo(0.12);
    expect(relativeChange(90, 100)).toBeCloseTo(-0.1);
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(null, 10)).toBeNull();
    expect(relativeChange(10, null)).toBeNull();
  });

  test('short IDs keep eight characters', () => {
    expect(shortId('a1f3c9e2deadbeef')).toBe('a1f3c9e2');
    expect(shortId('abc')).toBe('abc');
    expect(shortId('claude:b40073fb-824f-4e3f')).toBe('b40073fb');
  });
});

describe('traces duration formatting', () => {
  test('splits durations into seconds, minutes, or hours and minutes', () => {
    expect(durationParts(0, 'en')).toEqual({ kind: 'seconds', s: '0' });
    expect(durationParts(4_200, 'en')).toEqual({ kind: 'seconds', s: '4.2' });
    expect(durationParts(18_200, 'en')).toEqual({ kind: 'seconds', s: '18' });
    expect(durationParts(34 * 60_000, 'en')).toEqual({ kind: 'minutes', m: '34' });
    expect(durationParts(72 * 60_000, 'en')).toEqual({ kind: 'hours_minutes', h: '1', m: '12' });
    expect(durationParts(65 * 60_000, 'en')).toEqual({ kind: 'hours_minutes', h: '1', m: '05' });
    expect(durationParts(Number.NaN, 'en')).toEqual({ kind: 'seconds', s: '0' });
  });

  test('hour totals keep one decimal', () => {
    expect(hoursValue(63.5 * 3_600_000, 'en')).toBe('63.5');
    expect(hoursValue(0, 'en')).toBe('0');
    expect(hoursValue(250 * 3_600_000, 'en')).toBe('250');
  });

  describe('with the English templates', () => {
    let original = '';
    beforeAll(async () => {
      original = i18n.language;
      await i18n.changeLanguage('en');
    });
    afterAll(async () => {
      await i18n.changeLanguage(original);
    });

    test('templates read like the mockups', () => {
      const render = (ms: number) => {
        const parts = durationParts(ms, 'en');
        return i18n.t(`traces.units.${parts.kind}`, parts);
      };
      expect(render(72 * 60_000)).toBe('1 h 12 m');
      expect(render(34 * 60_000)).toBe('34 m');
      expect(render(18_200)).toBe('18 s');
      expect(i18n.t('traces.units.hours', { h: hoursValue(63.5 * 3_600_000, 'en') })).toBe('63.5 h');
    });
  });
});
