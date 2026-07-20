import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import { Icon } from '../../icons/IconSprite.jsx';
import { productionCardsSeed } from '../../data/mockData.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';

export default function ProductionDashboard() {
  const active = productionCardsSeed.filter((c) => c.stage !== 'done');
  const drafts = active.filter((c) => c.type === 'draft').length;
  const revisions = active.filter((c) => c.type === 'revision').length;
  const overdue = active.filter((c) => getDeadlineInfo(c.dueDate).tone === 'overdue').length;
  const dueSoon = active.filter((c) => getDeadlineInfo(c.dueDate).tone === 'warn');

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="blue" icon="i-production" label="Active Drafts" value={drafts} delta="4-day limit" />
        <StatCard tone="orange" icon="i-revision" label="Active Revisions" value={revisions} delta="2-day limit" />
        <StatCard tone="red" icon="i-alert" label="Overdue" value={overdue} />
        <StatCard tone="purple" icon="i-kanban" label="Total on Board" value={productionCardsSeed.length} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>Auto-notified — nearing deadline</h2><p>These cards were flagged automatically and sent to Notifications</p></div>
          <Link to="/production/board" className="tool-btn">Open board</Link>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 8 }}>
          {dueSoon.length ? dueSoon.map((c) => {
            const info = getDeadlineInfo(c.dueDate);
            return (
              <div key={c.id} className="rule-row">
                <div className="rule-icon"><Icon id={c.type === 'revision' ? 'i-revision' : 'i-production'} /></div>
                <div className="rule-copy"><strong>{c.title}</strong><span>{c.client} · {c.assignee.name}</span></div>
                <div className="rule-counter"><span className={`deadline-pill ${info.tone}`}><Icon id="i-clock" />{info.label}</span></div>
              </div>
            );
          }) : <div className="empty-state">Nothing nearing its deadline right now</div>}
        </div>
      </section>
    </>
  );
}
