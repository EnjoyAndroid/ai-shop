export function withoutOrderPassword<T extends { queryPasswordHash: string | null }>(order: T) {
  const { queryPasswordHash, ...safe } = order;
  return { ...safe, hasQueryPassword: Boolean(queryPasswordHash) };
}
