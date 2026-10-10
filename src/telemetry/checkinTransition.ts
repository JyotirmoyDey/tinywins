export type CheckinTransition = 'recorded' | 'changed' | 'removed' | null;

/** Classifies a committed selection attempt; slider previews never reach this boundary. */
export function checkinTransition(previousOptionId: string | undefined, nextOptionId: string | null,
  previousScaleVersionId?: string | null, currentScaleVersionId?: string | null): CheckinTransition {
  if (nextOptionId === null) return previousOptionId === undefined ? null : 'removed';
  if (previousOptionId === undefined) return 'recorded';
  if (previousOptionId === nextOptionId && previousScaleVersionId === currentScaleVersionId) return null;
  return 'changed';
}
