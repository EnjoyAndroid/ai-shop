/** Hide at least one character even for very short account names. */
export function maskSupportAccount(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.lastIndexOf('@');
  const name = Array.from(at > 0 ? value.slice(0, at) : value);
  const visible = name.slice(0, Math.min(2, Math.max(0, name.length - 1))).join('');
  return `${visible}***${at > 0 ? value.slice(at) : ''}`;
}
