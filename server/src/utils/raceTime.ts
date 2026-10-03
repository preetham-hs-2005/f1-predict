/** Session timestamps must identify one instant, regardless of server timezone. */
export function absoluteSessionDate(value?: string | null): Date | null {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
