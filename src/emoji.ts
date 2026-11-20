/** Objects, symbols, weather, plants and food only: no people, body parts or animals, and nothing that suggests
 * problems for software (alarms, fire, waiting, bombs, warnings). */
const EMOJIS = [
  '🚀',
  '🛸',
  '🚂',
  '🚁',
  '🚢',
  '⛵',
  '🚲',
  '🛹',
  '🎈',
  '🎁',
  '🎉',
  '🎊',
  '🏆',
  '🏅',
  '🎯',
  '🧩',
  '🔧',
  '🔩',
  '🔭',
  '🔬',
  '💡',
  '🔑',
  '💎',
  '📦',
  '📮',
  '📌',
  '📎',
  '🧭',
  '🪁',
  '🪐',
  '🌈',
  '🌙',
  '⭐',
  '🌟',
  '✨',
  '🍀',
  '🌵',
  '🌻',
  '🍄',
  '🍎',
  '🍋',
  '🍒',
  '🥝',
  '🍉',
  '🍕',
  '🍩',
  '🍪',
  '☕',
  '🧁',
  '🎸',
  '🎺',
  '🥁',
  '🎻',
  '🎨',
  '🧵',
  '🪄',
  '⚓',
  '🗺',
  '🌱',
  '🌿',
  '🌲',
  '🌳',
  '🌴',
  '🌸',
  '🌼',
  '🌺',
  '🌷',
  '🌹',
  '🍁',
  '🍃',
  '🌾',
  '🪴',
  '🍓',
  '🍇',
  '🍊',
  '🍑',
  '🍐',
  '🥑',
  '🫐',
  '🌞',
  '☀',
  '⛅',
  '🌊',
  '🏔',
  '❄',
  '🌍',
  '🪻',
] as const;

/**
 * `random` returns a number in [0, 1), like `Math.random`. Emojis in `exclude` are not picked (unless nothing else is
 * left).
 */
export function randomEmoji(
  random: () => number = Math.random,
  exclude: ReadonlyArray<string> = [],
): string {
  const free = EMOJIS.filter(emoji => !exclude.includes(emoji));
  const pool: ReadonlyArray<string> = free.length > 0 ? free : EMOJIS;

  return (
    pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)] ?? '🚀'
  );
}

const LEADING_EMOJI =
  /^\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/u;

/** The emoji a title starts with, or an empty string. */
export function leadingEmoji(title: string): string {
  return LEADING_EMOJI.exec(title.trimStart())?.[0] ?? '';
}
