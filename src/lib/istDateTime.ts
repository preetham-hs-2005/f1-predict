const IST_OFFSET_MS = 5.5 * 60 * 60_000;

/** datetime-local fields in race admin are explicitly shown in India time. */
export function istInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time in IST.");
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time in IST.");
  return date.toISOString();
}

export function isoToIstInput(value?: string | null): string {
  if (!value) return "";
  // Older records stored datetime-local text without an offset; show that value for correction.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}
