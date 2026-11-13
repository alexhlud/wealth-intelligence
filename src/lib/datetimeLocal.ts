function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** Formats an instant as the local wall-clock value required by datetime-local. */
export function formatDateTimeLocal(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
