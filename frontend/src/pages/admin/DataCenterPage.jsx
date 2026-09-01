import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { Icon } from '../../icons/IconSprite.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../api/client.js';

const PAGE_SIZE = 25;
const UNKNOWN = '__unknown__';

function formatCount(n) {
  return Number(n || 0).toLocaleString();
}

function statusMeta(raw) {
  const value = String(raw || '').trim();
  if (!value) return { label: 'Open', tone: 'muted' };
  const key = value.toLowerCase().replace(/!+$/, '');
  if (key === 'yes' || key === 'sent') return { label: 'Sent', tone: 'green' };
  if (key === 'marked' || key === 'haseeb') return { label: 'Marked', tone: 'orange' };
  if (key === 'worked' || key === 'working') return { label: 'Working', tone: 'blue' };
  if (key === 'no') return { label: 'No', tone: 'red' };
  if (key === 'find email' || key === 'eligible' || key === 'borderline') {
    return { label: value, tone: 'blue' };
  }
  return { label: value, tone: 'muted' };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function DataCenterPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);

  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState({
    summary: { total: 0, universities: 0, countries: 0 },
    universities: [],
    countries: [],
    unknownUniversity: 0,
    unknownCountry: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [university, setUniversity] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copyingId, setCopyingId] = useState(null);

  const loadMeta = useCallback(async () => {
    const data = await api.dataCenterMeta(token);
    setMeta({
      summary: data.summary || { total: 0, universities: 0, countries: 0 },
      universities: data.universities || [],
      countries: data.countries || [],
      unknownUniversity: Number(data.unknownUniversity || 0),
      unknownCountry: Number(data.unknownCountry || 0),
    });
  }, [token]);

  const load = useCallback(async () => {
    const data = await api.listDataCenter(token, {
      q: search.trim() || undefined,
      university: university || undefined,
      country: country || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    setLeads(data.leads || []);
    setPagination(data.pagination || {
      page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1,
    });
  }, [token, search, university, country, page]);

  useEffect(() => {
    setPage(1);
  }, [search, university, country]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await loadMeta();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Data Center');
      }
    })();
    return () => { cancelled = true; };
  }, [token, loadMeta]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        await load();
        if (!cancelled) setError('');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Data Center');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, load, search]);

  const universityOptions = useMemo(() => {
    const opts = meta.universities.map((u) => ({
      value: u.value,
      label: `${u.value} (${formatCount(u.count)})`,
    }));
    if (meta.unknownUniversity > 0) {
      opts.push({ value: UNKNOWN, label: `Unknown (${formatCount(meta.unknownUniversity)})` });
    }
    return opts;
  }, [meta.universities, meta.unknownUniversity]);

  const countryOptions = useMemo(() => {
    const opts = meta.countries.map((c) => ({
      value: c.value,
      label: `${c.value} (${formatCount(c.count)})`,
    }));
    if (meta.unknownCountry > 0) {
      opts.push({ value: UNKNOWN, label: `Unknown (${formatCount(meta.unknownCountry)})` });
    }
    return opts;
  }, [meta.countries, meta.unknownCountry]);

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const filteredTotal = pagination.total;
  const hasFilter = Boolean(search.trim() || university || country);
  const universityLabel = university === UNKNOWN
    ? 'Unknown university'
    : (meta.universities.find((u) => u.value === university)?.value || university);
  const countryLabel = country === UNKNOWN
    ? 'Unknown country'
    : (meta.countries.find((c) => c.value === country)?.value || country);

  function clearFilters() {
    setSearch('');
    setUniversity('');
    setCountry('');
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const blob = await api.exportDataCenter(token, {
        q: search.trim() || undefined,
        university: university || undefined,
        country: country || undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = hasFilter ? '-filtered' : '';
      downloadBlob(blob, `data-center${suffix}-${stamp}.csv`);
      showToast(
        hasFilter
          ? `Exported ${formatCount(filteredTotal)} filtered lead${filteredTotal === 1 ? '' : 's'}`
          : 'Exported all unique leads',
      );
    } catch (err) {
      setError(err.message);
      showToast(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file) {
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const result = await api.importDataCenterCsv(token, file);
      await Promise.all([load(), loadMeta()]);
      showToast(
        `Imported ${formatCount(result.inserted)} unique lead${result.inserted === 1 ? '' : 's'}`
        + (result.skippedExisting ? ` · ${formatCount(result.skippedExisting)} already present` : '')
        + (result.skippedInvalid ? ` · ${formatCount(result.skippedInvalid)} invalid skipped` : ''),
      );
    } catch (err) {
      setError(err.message);
      showToast(err.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function copyEmail(lead) {
    try {
      await navigator.clipboard.writeText(lead.email);
      setCopyingId(lead.id);
      showToast(`Copied ${lead.email}`);
      window.setTimeout(() => setCopyingId((id) => (id === lead.id ? null : id)), 1200);
    } catch {
      showToast('Could not copy email');
    }
  }

  return (
    <div className="data-center-page">
      <section className="stats-grid" aria-label="Data Center summary">
        <StatCard
          tone="purple"
          icon="i-building"
          label="Unique leads"
          value={formatCount(meta.summary.total)}
          delta="Deduped by email"
        />
        <StatCard
          tone="blue"
          icon="i-filter"
          label="Universities"
          value={formatCount(meta.summary.universities)}
          delta="From academic email domains"
        />
        <StatCard
          tone="green"
          icon="i-grid"
          label="Countries"
          value={formatCount(meta.summary.countries)}
          delta="Filter and export any subset"
        />
        <StatCard
          tone="orange"
          icon="i-search"
          label="In this view"
          value={formatCount(filteredTotal)}
          delta={hasFilter ? 'Matching current filters' : 'All unique records'}
        />
      </section>

      <section className="page-section">
        <div className="section-heading section-heading--filters">
          <div>
            <h2>Data Center</h2>
            <p>Unique faculty leads. Filter by university or country, then export exactly that set.</p>
          </div>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search name, email, or university…"
            searchAriaLabel="Search leads"
            statusOptions={universityOptions}
            status={university}
            onStatus={setUniversity}
            statusPlaceholder="All universities"
            secondaryStatusOptions={countryOptions}
            secondaryStatus={country}
            onSecondaryStatus={setCountry}
            secondaryStatusPlaceholder="All countries"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
            {hasFilter ? (
              <button
                type="button"
                className="tool-btn toolbar-control"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              className="tool-btn toolbar-control"
              disabled={importing}
              aria-label="Import CSV of leads"
              onClick={() => fileRef.current?.click()}
            >
              <Icon id="i-paperclip" /> {importing ? 'Importing…' : 'Import CSV'}
            </button>
            <button
              type="button"
              className="tool-btn primary-btn toolbar-control"
              disabled={exporting || filteredTotal === 0}
              aria-label={hasFilter ? 'Export filtered leads as CSV' : 'Export all leads as CSV'}
              onClick={handleExport}
            >
              <Icon id="i-external" /> {exporting ? 'Exporting…' : hasFilter ? 'Export filtered' : 'Export CSV'}
            </button>
          </TableToolbar>
        </div>

        <p className="data-center-summary" aria-live="polite">
          {loading && leads.length === 0
            ? 'Loading leads…'
            : hasFilter
              ? `${formatCount(filteredTotal)} of ${formatCount(meta.summary.total)} leads`
                + (university ? ` · ${universityLabel}` : '')
                + (country ? ` · ${countryLabel}` : '')
                + (search.trim() ? ` · “${search.trim()}”` : '')
              : `${formatCount(meta.summary.total)} unique leads`}
        </p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className={`panel commission-scroll${loading ? ' is-loading' : ''}`}>
          <table className="attendance-table data-center-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>University</th>
                <th>Country</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="data-center-empty">
                    {loading
                      ? 'Loading leads…'
                      : hasFilter
                        ? 'No leads match these filters. Clear filters to see the full list.'
                        : 'No leads yet. Import a CSV with Name and Email columns.'}
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const status = statusMeta(lead.status);
                  return (
                    <tr key={lead.id}>
                      <td data-label="Name">
                        <strong className="data-center-name">{lead.name}</strong>
                      </td>
                      <td data-label="Email">
                        <div className="data-center-email-cell">
                          <a className="data-center-email" href={`mailto:${lead.email}`}>{lead.email}</a>
                          <button
                            type="button"
                            className="data-center-copy"
                            aria-label={`Copy ${lead.email}`}
                            onClick={() => copyEmail(lead)}
                          >
                            {copyingId === lead.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </td>
                      <td data-label="University">
                        <span className="data-center-chip">{lead.university || 'Unknown'}</span>
                      </td>
                      <td data-label="Country">
                        <span className="data-center-chip data-center-chip--quiet">
                          {lead.country || 'Unknown'}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className={`data-center-status is-${status.tone}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          total={pagination.total}
          page={pagination.page}
          totalPages={pagination.totalPages}
          from={from}
          to={to}
          pageSize={pagination.pageSize}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          emptyLabel="No leads"
        />
      </section>
    </div>
  );
}
