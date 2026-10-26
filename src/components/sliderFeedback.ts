/** Haptic feedback is best-effort and must never interrupt selection or commit handling. */
export function triggerSliderHaptic(haptic: () => Promise<unknown>) {
  try {
    void haptic().catch(() => {});
  } catch {
    // Some unavailable native implementations can throw before returning a Promise.
  }
}

/** Shared ordering for the screen-reader selection path: preview first, then commit. */
export function previewThenCommitSliderValue(
  index: number,
  preview: (index: number) => void,
  commit: (index: number) => void,
) {
  preview(index);
  commit(index);
}
