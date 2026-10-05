type Props = {
  labels: string[]
  hourIndex: number
  onChange: (index: number) => void
  playing: boolean
  onTogglePlay: () => void
  /** Slim strip docked on the map */
  compact?: boolean
  dock?: 'top' | 'bottom'
}

export function WeatherTimeline({
  labels,
  hourIndex,
  onChange,
  playing,
  onTogglePlay,
  compact,
  dock = 'top',
}: Props) {
  const max = Math.max(0, labels.length - 1)
  const label = labels[hourIndex] ?? '—'

  return (
    <div
      className={`weather-timeline${
        compact ? ` weather-timeline--compact weather-timeline--map-${dock}` : ''
      }`}
      role="group"
      aria-label="Weather time machine"
    >
      <button
        type="button"
        className="weather-timeline__play"
        onClick={onTogglePlay}
        aria-pressed={playing}
        aria-label={playing ? 'Pause animation' : 'Play animation'}
      >
        <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden />
        {compact ? null : playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="weather-timeline__step"
        disabled={hourIndex <= 0}
        onClick={() => onChange(Math.max(0, hourIndex - 1))}
        aria-label="Previous hour"
      >
        ◀
      </button>
      <input
        type="range"
        className="weather-timeline__slider"
        min={0}
        max={max}
        value={hourIndex}
        onChange={e => onChange(Number(e.target.value))}
        aria-valuetext={label}
      />
      <button
        type="button"
        className="weather-timeline__step"
        disabled={hourIndex >= max}
        onClick={() => onChange(Math.min(max, hourIndex + 1))}
        aria-label="Next hour"
      >
        ▶
      </button>
      <span className="weather-timeline__label">{label}</span>
    </div>
  )
}
