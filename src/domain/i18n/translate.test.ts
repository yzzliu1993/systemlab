import en from '@/content/locales/en.json';
import zhTW from '@/content/locales/zh-TW.json';
import { translate } from '@/domain/i18n/translate';

describe('translate', () => {
  it('T6: falls back to English, then to the key', () => {
    expect(translate('a', { a: 'zh' }, { a: 'en' })).toBe('zh');
    expect(translate('a', {}, { a: 'en' })).toBe('en');
    expect(translate('a', {}, {})).toBe('a');
  });
});

describe('locale files', () => {
  it('T7: en.json and zh-TW.json have the same keys', () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());
  });
});
