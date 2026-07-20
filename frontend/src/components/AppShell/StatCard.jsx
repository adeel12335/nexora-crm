import { Icon } from '../../icons/IconSprite.jsx';

export default function StatCard({ tone = 'purple', icon, label, value, delta }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-icon"><Icon id={icon} /></div>
      <div><span>{label}</span><strong>{value}</strong></div>
      {delta && <em>{delta}</em>}
    </article>
  );
}
