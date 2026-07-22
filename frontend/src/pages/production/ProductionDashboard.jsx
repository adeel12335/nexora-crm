import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { normalizeProductionStage } from '../../data/productionStages.js';

const REVISION_STAGES = new Set([
  'draft_revisions',
  'edits_after_publishing',
  'pages_to_relive',
]);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ProductionDashboard() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.listProductionCards(token);
        if (!cancelled) setCards(data.cards || data || []);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load production stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast]);

  const stats = useMemo(() => {
    const today = startOfToday();
    let drafts = 0;
    let revisions = 0;
    let overdue = 0;
    let open = 0;
    for (const card of cards) {
      const stage = normalizeProductionStage(card.stage);
      if (stage === 'page_live' || stage === 'stopped_process') continue;
      open += 1;
      if (REVISION_STAGES.has(stage) || card.type === 'revision') revisions += 1;
      else drafts += 1;
      const due = card.dueDate ? new Date(card.dueDate) : null;
      if (due && !Number.isNaN(due.getTime()) && due < today) overdue += 1;
    }
    return { drafts, revisions, overdue, open };
  }, [cards]);

  return (
    <>
      <section className="stats-grid">
        <StatCard
          tone="blue"
          icon="i-production"
          label="Active Drafts"
          value={loading ? '—' : stats.drafts}
          delta="Open Production Board"
        />
        <StatCard
          tone="orange"
          icon="i-revision"
          label="Active Revisions"
          value={loading ? '—' : stats.revisions}
          delta="Comments & edits"
        />
        <StatCard
          tone="red"
          icon="i-alert"
          label="Overdue"
          value={loading ? '—' : stats.overdue}
          delta="Past due date"
        />
        <StatCard
          tone="purple"
          icon="i-kanban"
          label="Open cards"
          value={loading ? '—' : stats.open}
          delta="Not live / stopped"
        />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Production</h2>
            <p>Track drafts, revisions, and overdue work from the live board.</p>
          </div>
          <Link to="/production/board" className="tool-btn">Open board</Link>
        </div>
        <div className="panel empty-state">
          Use the Production Board to manage cards. Deadline WhatsApp alerts fire at 1 day and 12 hours before due.
        </div>
      </section>
    </>
  );
}
