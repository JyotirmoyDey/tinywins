import config from './config/journey-together.json';

function hashId(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Resolve palette collisions in stable ID order, never in the display order.
 * Include archived IDs to retain their colors while temporarily hidden. */
export function colorsByTaskId(allTaskIds: string[]): Map<string, string> {
  const palette = config.style.colors;
  const assigned = new Map<string, string>();
  const used = new Set<number>();
  for (const id of [...new Set(allTaskIds)].sort()) {
    let slot = hashId(id) % palette.length;
    while (used.has(slot) && used.size < palette.length) slot = (slot + 1) % palette.length;
    assigned.set(id, palette[slot]);
    used.add(slot);
  }
  return assigned;
}

export function fallbackTaskColor(id: string) {
  return config.style.colors[hashId(id) % config.style.colors.length];
}

/** Choose a new distinct color without reassigning any existing task. */
export function nextTaskColor(usedColors: Iterable<string>) {
  const used = new Set(usedColors);
  const available = config.style.colors.find(color => !used.has(color));
  if (available) return available;
  // Additional archived activities may exhaust the curated palette. Keep
  // generated extensions muted and distinct while retaining older colors.
  for (let step = 0; ; step++) {
    const hue = (37 + step * 137.508) % 360;
    const saturation = 0.32, lightness = 0.43;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const middle = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const match = hue < 60 ? [chroma, middle, 0] : hue < 120 ? [middle, chroma, 0] :
      hue < 180 ? [0, chroma, middle] : hue < 240 ? [0, middle, chroma] :
        hue < 300 ? [middle, 0, chroma] : [chroma, 0, middle];
    const offset = lightness - chroma / 2;
    const candidate = `#${match.map(value => Math.round((value + offset) * 255)
      .toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    if (!used.has(candidate)) return candidate;
  }
}
