/** Keeps a saved selection inside the active portfolio's returned accounts. */
export function reconcileAccountSelection(storedIds: readonly string[] | null, accountIds: readonly string[]): Set<string> {
  return new Set((storedIds ?? accountIds).filter((id) => accountIds.includes(id)))
}
