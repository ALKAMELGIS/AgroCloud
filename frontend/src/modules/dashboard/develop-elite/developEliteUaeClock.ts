export const DEVELOP_ELITE_UAE_TIME_ZONE = 'Asia/Dubai'

export const DEVELOP_ELITE_CLOCK_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type DevelopEliteUaeClockParts = {
  hours: string
  minutes: string
  seconds: string
  weekdayShort: string
  weekdayIndex: number
  monthDay: string
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find(p => p.type === type)?.value ?? ''
}

export function getDevelopEliteUaeClockParts(
  now: Date,
  timeZone: string = DEVELOP_ELITE_UAE_TIME_ZONE,
): DevelopEliteUaeClockParts {
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(now)

  const weekdayShort = partValue(dateParts, 'weekday')
  const weekdayIndex = DEVELOP_ELITE_CLOCK_WEEKDAYS.findIndex(
    d => d.toLowerCase() === weekdayShort.toLowerCase(),
  )

  const day = partValue(dateParts, 'day')
  const month = partValue(dateParts, 'month')

  return {
    hours: partValue(timeParts, 'hour'),
    minutes: partValue(timeParts, 'minute'),
    seconds: partValue(timeParts, 'second'),
    weekdayShort,
    weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    monthDay: `${month}.${day}`,
  }
}

export function formatDevelopEliteUaeClockAriaLabel(parts: DevelopEliteUaeClockParts): string {
  return `UAE time ${parts.hours}:${parts.minutes}:${parts.seconds}, ${parts.weekdayShort} ${parts.monthDay}`
}

/** Seven-segment mask: a,b,c,d,e,f,g */
export const DEVELOP_ELITE_SEVEN_SEGMENT: Record<string, readonly boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
}

export function developEliteSevenSegmentMask(char: string): readonly boolean[] {
  return DEVELOP_ELITE_SEVEN_SEGMENT[char] ?? [false, false, false, false, false, false, false]
}
