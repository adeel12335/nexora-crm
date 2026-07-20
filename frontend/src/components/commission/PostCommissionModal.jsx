import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Admin selects pending payments (cycle start → today) and posts commission.
 */
export default function PostCommissionModal({ open, onClose, onPosted }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.pendingCommissions(token);
        if (cancelled) return;
        setData(res);
        setSelected(new Set((res.payments || []).map((p) => p.id)));
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load pending payments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, showToast]);

  const payments = data?.payments || [];
  const selectedRows = useMemo(
    () => payments.filter((p) => selected.has(p.id)),
    [payments, selected]
  );
  const previewTotal = selectedRows.reduce((s, p) => s + Number(p.commissionTotal || 0), 0);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === payments.length) setSelected(new Set());
    else setSelected(new Set(payments.map((p) => p.id)));
  }

  async function submit() {
    if (!selected.size) {
      showToast('Select at least one payment');
      return;
    }
    setBusy(true);
    try {
      const res = await api.postCommissions(token, [...selected]);
      showToast(
        `Posted ${res.posted} payment(s) · commission ${money(res.totalCommission)}`
      );
      onPosted?.();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to post commission');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="checkin-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="checkin-modal panel post-commission-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="post-commission-title"
      >
        <h3 id="post-commission-title">Post commission</h3>
        <p>
          Payments from <strong>{data?.from || '…'}</strong> → <strong>{data?.to || '…'}</strong>{' '}
          that still need commission. Select rows, then post — agent + manager cuts calculate from
          current rates.
        </p>

        {loading ? (
          <div className="empty-state">Loading pending payments…</div>
        ) : (
          <>
            <div className="panel" style={{ overflowX: 'auto', maxHeight: 360 }}>
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={payments.length > 0 && selected.size === payments.length}
                        onChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Agent</th>
                    <th>Payment</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          aria-label={`Select payment ${p.id}`}
                        />
                      </td>
                      <td>{p.paymentDate}</td>
                      <td>{p.clientName}</td>
                      <td>{p.agentName}</td>
                      <td>{money(p.amount)}</td>
                      <td>
                        {p.lines?.length
                          ? p.lines
                              .map((l) => `${l.role} ${l.rate}% → ${money(l.amount)}`)
                              .join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          No pending payments in this window — all posted, or none recorded yet.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="commission-note" style={{ marginTop: 10 }}>
              Selected <strong>{selected.size}</strong> · preview total{' '}
              <strong>{money(previewTotal)}</strong>
            </p>
          </>
        )}

        <div className="checkin-modal-actions">
          <button type="button" className="tool-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="tool-btn primary"
            onClick={submit}
            disabled={busy || loading || !selected.size}
          >
            {busy ? 'Posting…' : 'Post selected'}
          </button>
        </div>
      </div>
    </div>
  );
}
