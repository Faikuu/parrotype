// datetime-local inputs work in the viewer's local time. The API takes ISO instants (UTC), so the two are
// converted here: a local value is read as local time, and an instant is shown in local time.

const pad = (n: number) => String(n).padStart(2, '0');

/** The value a datetime-local input shows for an ISO instant, in local time (YYYY-MM-DDTHH:mm), or '' when invalid. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The ISO UTC instant for a datetime-local value (read as local time), or null when it is empty or not a date. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The local value for "now", rounded down to the minute. Used as the default start of a new item. */
export function localNow(): string {
  return toLocalInput(new Date().toISOString());
}
