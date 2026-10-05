export function isStoreOpen(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value
  const minutes = Number(value('hour')) * 60 + Number(value('minute'))
  return value('weekday') !== 'Sun' && minutes >= 9 * 60 && minutes < 23 * 60
}
