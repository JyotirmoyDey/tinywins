import Graphemer from 'graphemer';

export const MAX_NAME_CHARACTERS = 24;
export const MAX_OPTION_CHARACTERS = 18;
export const MAX_OPTION_DESCRIPTION_CHARACTERS = 150;

const splitter = new Graphemer();

/** A character here means one visible grapheme, including joined emoji. */
export function characterCount(value: string): number {
  return splitter.countGraphemes(value);
}

/** Reserve room for multi-code-unit graphemes while editing; at the visible
 * character limit, let the native input enforce the exact current length. */
export function nativeTextMaxLength(value: string, limit: number): number {
  return value.length + Math.max(0, limit - characterCount(value)) * 16;
}

export function constrainTextInput(previous: string, next: string, limit: number): { value: string; exceeded: boolean } {
  const count = characterCount(next);
  if (count <= limit) return { value: next, exceeded: false };
  const previousCount = characterCount(previous);
  // Legacy values can already exceed the limit. Let users edit them down without
  // silently truncating the stored text, but never let them grow longer.
  if (previousCount >= limit) return count <= previousCount
    ? { value: next, exceeded: false }
    : { value: previous, exceeded: true };
  return { value: splitter.splitGraphemes(next).slice(0, limit).join(''), exceeded: true };
}
