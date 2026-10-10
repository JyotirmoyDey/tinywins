import { constrainTextInput } from '../domain/inputLimits';

/** Reconcile the native field even when an over-limit edit leaves React state unchanged. */
export function limitNativeTextInput(
  previous: string,
  next: string,
  limit: number,
  restoreNativeText: (value: string) => void,
) {
  const result = constrainTextInput(previous, next, limit);
  if (result.value !== next) restoreNativeText(result.value);
  return result;
}
