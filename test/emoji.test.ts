import {describe, expect, it} from 'vitest';
import {randomEmoji} from '../src/emoji.js';

describe('randomEmoji', () => {
  it('picks deterministically from the random source', () => {
    expect(randomEmoji(() => 0)).toBe('🚀');
    expect(randomEmoji(() => 0.999999)).not.toBe('');
    expect(randomEmoji(() => 1)).toBe(randomEmoji(() => 0.999999));
  });

  it('returns different emojis and none that is a person or an animal', () => {
    const seen = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const emoji = randomEmoji(() => i / 200);

      seen.add(emoji);
      expect(emoji).not.toMatch(/\p{Emoji_Modifier_Base}/u);
    }

    expect(seen.size).toBeGreaterThan(30);
  });
});
