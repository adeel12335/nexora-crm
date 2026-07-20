import { DayFilter } from '../filters/MonthFilter.jsx';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'range', label: 'Date range' },
];

/**
 * Today / Yesterday / Range period control.
 */
export default function PeriodFilter({
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
}) {
  return (
    <div className="period-filter">
      <div className="period-pills" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`period-pill${preset === p.value ? ' is-active' : ''}`}
            onClick={() => onPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'range' ? (
        <div className="toolbar-dates period-range">
          <DayFilter value={from} onChange={onFrom} placeholder="From" />
          <span className="toolbar-date-sep" aria-hidden="true">→</span>
          <DayFilter
            value={to}
            onChange={onTo}
            placeholder="To"
            minDate={from ? new Date(`${from}T12:00:00`) : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}

export { PRESETS };
