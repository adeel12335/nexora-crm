import CheckInWidget from '../../components/attendance/CheckInWidget.jsx';
import AttendanceCalendar from '../../components/attendance/AttendanceCalendar.jsx';
import AttendanceRulesCard from '../../components/attendance/AttendanceRulesCard.jsx';
import { findAgentForUser } from '../../data/mockData.js';
import { useRoleContext } from '../../layouts/RoleLayout.jsx';

export default function AgentAttendance() {
  const { user } = useRoleContext();
  const me = findAgentForUser(user);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div><h2>My Attendance</h2><p>Check in when you start, check out when you leave</p></div>
      </div>
      <div className="attendance-grid">
        <CheckInWidget initialCheckIn={me.checkIn} initialCheckOut={me.checkOut} />
        <AttendanceCalendar lateCount={me.lateCount} offsTaken={me.offsTaken} />
      </div>
      <div style={{ marginTop: 16 }}>
        <AttendanceRulesCard lateCount={me.lateCount} offsTaken={me.offsTaken} />
      </div>
    </section>
  );
}
