export type OptionPositions = Record<string, number>;
export const OPTION_ROW_HEIGHT = 76;

export function positionsForIds(ids: string[]): OptionPositions {
  'worklet';
  const positions: OptionPositions = {};
  ids.forEach((id, index) => { positions[id] = index; });
  return positions;
}

/** Move one choice and open a slot by shifting every intervening choice. */
export function movePosition(positions: OptionPositions, id: string, target: number): OptionPositions {
  'worklet';
  const from = positions[id];
  const to = Math.max(0, Math.min(Object.keys(positions).length - 1, target));
  if (from === undefined || from === to) return positions;
  const next = { ...positions };
  for (const key of Object.keys(next)) {
    const position = positions[key];
    if (key === id) next[key] = to;
    else if (from < to && position > from && position <= to) next[key] = position - 1;
    else if (from > to && position >= to && position < from) next[key] = position + 1;
  }
  return next;
}
