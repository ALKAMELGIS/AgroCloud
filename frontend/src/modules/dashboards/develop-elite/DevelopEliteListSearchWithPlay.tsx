type Props = {
  playing: boolean
  onTogglePlay: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  placeholder?: string
  playAriaLabel: string
  pauseAriaLabel: string
}

export function DevelopEliteListSearchWithPlay({
  playing,
  onTogglePlay,
  searchValue,
  onSearchChange,
  placeholder = 'Search',
  playAriaLabel,
  pauseAriaLabel,
}: Props) {
  return (
    <div className="develop-elite__search-row">
      <label className="develop-elite__search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden />
        <input
          type="search"
          placeholder={placeholder}
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={`develop-elite__search-play${playing ? ' is-active' : ''}`}
        aria-label={playing ? pauseAriaLabel : playAriaLabel}
        aria-pressed={playing}
        title={playing ? 'Pause' : 'Play'}
        onClick={onTogglePlay}
      >
        <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden />
      </button>
    </div>
  )
}
