import { useEffect, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import AttendanceRulesCard from '../../components/attendance/AttendanceRulesCard.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AgentDashboard() {
  const { token } = useAuth();
  const [month, setMonth] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.attendanceToday(token);
        if (!cancelled) setMonth(data.month);
      } catch {
        /* sticky bar already toasts load errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="green" icon="i-check" label="Days Present" value={month?.presentCount ?? '—'} />
        <StatCard tone="orange" icon="i-clock" label="Lates This Month" value={month?.lateCount ?? '—'} />
        <StatCard
          tone="blue"
          icon="i-calendar"
          label="Offs Used"
          value={month ? `${month.effectiveOffs}/2` : '—'}
        />
        <StatCard
          tone="red"
          icon="i-deduction"
          label="Deduction"
          value={month?.deduction ? 'Flagged' : 'No'}
        />
      </section>

      <section className="page-section">
        <AttendanceRulesCard lateCount={month?.lateCount ?? 0} offsTaken={month?.offsTaken ?? 0} />
      </section>
    </>
  );
}
