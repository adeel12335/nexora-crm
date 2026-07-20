import { useMemo, useState, useEffect } from 'react';

export const DEFAULT_PAGE_SIZE = 10;

export function slicePage(items, page, size) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

export function pageMeta(total, page, size) {
  if (total === 0) return { from: 0, to: 0, totalPages: 1, page: 1 };
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    totalPages,
    from: (safePage - 1) * size + 1,
    to: Math.min(safePage * size, total),
  };
}

/**
 * Client-side search + optional agentId + date range + pagination.
 * @param {object[]} items
 * @param {{ searchFields?: string[], getAgentId?: (row)=>any, getDate?: (row)=>string|null }} opts
 */
export function useTableQuery(items, opts = {}) {
  const {
    searchFields = ['name', 'email'],
    getAgentId,
    getDate,
    pageSize = DEFAULT_PAGE_SIZE,
  } = opts;

  const [search, setSearch] = useState('');
  const [agentId, setAgentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, agentId, dateFrom, dateTo, items]);

  const fieldsKey = Array.isArray(searchFields) ? searchFields.join('|') : 'name|email';
  const fields = useMemo(() => fieldsKey.split('|'), [fieldsKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter((row) => {
      if (agentId && getAgentId) {
        if (String(getAgentId(row)) !== String(agentId)) return false;
      }
      if ((dateFrom || dateTo) && getDate) {
        const d = String(getDate(row) || '').slice(0, 10);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      if (!q) return true;
      return fields.some((field) => {
        const val = row[field];
        return val != null && String(val).toLowerCase().includes(q);
      });
    });
  }, [items, search, agentId, dateFrom, dateTo, fields, getAgentId, getDate]);

  const meta = pageMeta(filtered.length, page, pageSize);
  const pageItems = slicePage(filtered, meta.page, pageSize);

  return {
    search,
    setSearch,
    agentId,
    setAgentId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page: meta.page,
    setPage,
    pageSize,
    filtered,
    pageItems,
    total: filtered.length,
    totalPages: meta.totalPages,
    from: meta.from,
    to: meta.to,
  };
}
