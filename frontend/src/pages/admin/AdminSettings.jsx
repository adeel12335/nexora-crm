import { Icon } from '../../icons/IconSprite.jsx';

const ROWS = [
  { icon: 'i-clock', title: 'Late check-in cutoff', value: '9:15 AM', desc: 'Check-ins after this time are marked late.' },
  { icon: 'i-revision', title: 'Late → auto off threshold', value: 'Every 4th late', desc: 'The 4th late check-in in a cycle counts as 1 day off.' },
  { icon: 'i-calendar', title: 'Free offs per month', value: '2', desc: 'The 3rd off in a month triggers a payroll deduction flag.' },
  { icon: 'i-production', title: 'New draft deadline', value: '4 days', desc: 'Time limit for a fresh production draft.' },
  { icon: 'i-revision', title: 'Revision deadline', value: '2 days', desc: 'Time limit for a requested revision.' },
  { icon: 'i-whatsapp', title: 'WhatsApp alerts', value: 'Enabled', desc: 'Deadline and attendance alerts are sent to WhatsApp (Phase 2).' },
];

export default function AdminSettings() {
  return (
    <section className="page-section">
      <div className="section-heading">
        <div><h2>Portal Settings</h2><p>Business rules powering attendance and production alerts — read-only preview, editable once the backend is connected</p></div>
      </div>
      <div className="panel" style={{ display: 'grid', gap: 2 }}>
        {ROWS.map((row) => (
          <div className="rule-row" key={row.title}>
            <div className="rule-icon"><Icon id={row.icon} /></div>
            <div className="rule-copy"><strong>{row.title}</strong><span>{row.desc}</span></div>
            <div className="rule-counter"><strong>{row.value}</strong></div>
          </div>
        ))}
      </div>
    </section>
  );
}
