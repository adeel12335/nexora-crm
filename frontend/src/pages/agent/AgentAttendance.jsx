import { useEffect, useState } from 'react';
import CheckInWidget from '../../components/attendance/CheckInWidget.jsx';
import AttendanceCalendar from '../../components/attendance/AttendanceCalendar.jsx';
import AttendanceRulesCard from '../../components/attendance/AttendanceRulesCard.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAttendanceSession } from '../../hooks/useAttendanceSession.jsx';

export default function AgentAttendance() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const { month } = useAttendanceSession();
  const [days, setDays] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.attendanceMe(token);
        if (cancelled) return;
        setDays(data.days || []);
        setSummary(data.summary);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load calendar');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast, month?.lateCount, month?.offsTaken, month?.presentCount]);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div><h2>My Attendance</h2><p>Check in when you start, check out when you leave</p></div>
      </div>
      <div className="attendance-grid">
        <CheckInWidget />
        <AttendanceCalendar days={days} />
      </div>
      <div style={{ marginTop: 16 }}>
        <AttendanceRulesCard
          lateCount={summary?.lateCount ?? month?.lateCount ?? 0}
          offsTaken={summary?.offsTaken ?? month?.offsTaken ?? 0}
        />
      </div>
    </section>
  );
}
