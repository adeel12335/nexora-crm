export default function PaginationBar({
  total,
  page,
  totalPages,
  from,
  to,
  pageSize,
  onPrev,
  onNext,
  emptyLabel = 'No results',
  compact = false,
}) {
  return (
    <div className={`pagination-bar${compact ? ' pagination-bar--compact' : ''}`}>
      <span className="pagination-meta">
        {total === 0
          ? emptyLabel
          : `Showing ${from}–${to} of ${total}${pageSize ? ` · ${pageSize} per page` : ''}`}
      </span>
      <div className="pagination-controls">
        <button type="button" className="tool-btn" disabled={page <= 1} onClick={onPrev}>
          {compact ? 'Prev' : 'Previous'}
        </button>
        <span className="pagination-page">
          {compact ? `${page}/${totalPages}` : `Page ${page} / ${totalPages}`}
        </span>
        <button type="button" className="tool-btn" disabled={page >= totalPages} onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  );
}
