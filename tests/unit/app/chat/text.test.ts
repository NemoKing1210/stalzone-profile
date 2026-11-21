import { describe, expect, it } from 'vitest';

import { cleanAssistantText } from '~/features/chat/model/text';

const bar = '\uff5c';

describe('assistant text', () => {
  it('keeps ordinary text untouched', () => {
    expect(cleanAssistantText('Топ 5 автоматов: АК-12, HK416.')).toBe('Топ 5 автоматов: АК-12, HK416.');
  });

  it('removes a leaked tool-call block and keeps the prose', () => {
    const text = `Проверю лидеров.\n\n<${bar}DSML${bar} calls>\n<${bar}DSML${bar} invoke name="compare_items">\n</${bar}DSML${bar} invoke>\n</${bar}DSML${bar} calls>`;
    expect(cleanAssistantText(text)).toBe('Проверю лидеров.');
  });

  it('removes a truncated marker tail', () => {
    const text = `Проверю лидеров.\n\n<${bar}DSML${bar} calls>\n<${bar}DSML${bar} invoke name="compare_items">`;
    expect(cleanAssistantText(text)).toBe('Проверю лидеров.');
  });
});
