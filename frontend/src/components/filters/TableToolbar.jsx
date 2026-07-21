import MonthFilter, { DayFilter } from './MonthFilter.jsx';
import FancySelect from './FancySelect.jsx';

/**
 * Shared toolbar: search, fancy select, date range, optional month picker.
 * Single 42px control row — date fields use placeholders (no stacked labels).
 */
export default function TableToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  agents,
  agentId,
  onAgentId,
  agentLabel = 'Agent',
  statusOptions,
  status,
  onStatus,
  statusPlaceholder = 'All statuses',
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  showDateRange = false,
  month,
  onMonth,
  showMonth = false,
  monthLabel = 'Month',
  children,
}) {
  const showAgent = Array.isArray(agents) && onAgentId;
  const agentOptions = showAgent
    ? agents.map((a) => ({ value: String(a.id), label: a.name }))
    : [];
  const showStatus = Array.isArray(statusOptions) && onStatus;

  return (
    <div className="heading-tools table-toolbar">
      {onSearch ? (
        <input
          className="search-input toolbar-control"
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      ) : null}

      {showAgent ? (
        <FancySelect
          value={agentId}
          onChange={onAgentId}
          options={agentOptions}
          placeholder={`All ${agentLabel.toLowerCase()}s`}
          aria-label={agentLabel}
          className="toolbar-fancy-select"
          isClearable
        />
      ) : null}

      {showStatus ? (
        <FancySelect
          value={status}
          onChange={onStatus}
          options={statusOptions}
          placeholder={statusPlaceholder}
          aria-label="Status"
          className="toolbar-fancy-select"
          isClearable
        />
      ) : null}

      {showDateRange ? (
        <div className="toolbar-dates" role="group" aria-label="Date range">
          <DayFilter
            value={dateFrom}
            onChange={onDateFrom}
            placeholder="From date"
          />
          <span className="toolbar-date-sep" aria-hidden="true">→</span>
          <DayFilter
            value={dateTo}
            onChange={onDateTo}
            placeholder="To date"
            minDate={dateFrom ? new Date(`${dateFrom}T12:00:00`) : undefined}
          />
        </div>
      ) : null}

      {showMonth && onMonth ? (
        <MonthFilter value={month} onChange={onMonth} label={null} placeholder={monthLabel} />
      ) : null}

      {children ? <div className="toolbar-actions">{children}</div> : null}
    </div>
  );
}
