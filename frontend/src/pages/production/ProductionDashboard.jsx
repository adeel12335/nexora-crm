import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';

export default function ProductionDashboard() {
  return (
    <>
      <section className="stats-grid">
        <StatCard tone="blue" icon="i-production" label="Active Drafts" value="—" delta="Open Production Board" />
        <StatCard tone="orange" icon="i-revision" label="Active Revisions" value="—" delta="2-day default" />
        <StatCard tone="red" icon="i-alert" label="Overdue" value="—" delta="Tracked on the board" />
        <StatCard tone="purple" icon="i-kanban" label="Board" value="Live" delta="No demo cards" />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Production</h2>
            <p>Create and manage real cards on the board — dummy seed data has been removed.</p>
          </div>
          <Link to="/production/board" className="tool-btn">Open board</Link>
        </div>
        <div className="panel empty-state">
          Use the Production Board to add cards. Deadlines and WhatsApp alerts will use live data.
        </div>
      </section>
    </>
  );
}
