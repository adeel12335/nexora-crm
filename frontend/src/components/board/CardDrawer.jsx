import { useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';

export default function CardDrawer({ card, stage, open, onClose, activity, onAddComment }) {
  const [comment, setComment] = useState('');
  if (!card) return null;
  const deadline = getDeadlineInfo(card.dueDate);

  return (
    <aside className={`detail-panel${open ? ' open' : ''}`} aria-label="Card details">
      <div className="detail-top">
        <div className="tag-row">
          <span className="tag tag-blue">{stage?.title}</span>
          <span className={`tag ${card.type === 'revision' ? 'tag-orange' : 'tag-blue'}`}>{card.type === 'draft' ? 'Draft' : 'Revision'}</span>
          {card.priority && <span className="tag tag-red">High Priority</span>}
        </div>
        <button className="plain-icon" aria-label="Close details" onClick={onClose}><Icon id="i-close" /></button>
      </div>
      <h2>{card.title}</h2>
      <span className="detail-sub">{card.client}</span>
      <div className="detail-icon-row">
        <button aria-label="Assignee"><Icon id="i-users" /></button>
        <button aria-label="Client"><Icon id="i-contact" /></button>
        <button aria-label="Due date"><Icon id="i-calendar" /></button>
        <button aria-label="Attachments"><Icon id="i-paperclip" /></button>
        <button aria-label="More"><Icon id="i-more" /></button>
      </div>
      <section className="detail-section">
        <h3>Description</h3>
        <p>{card.description || 'No description added yet.'}</p>
      </section>
      <section className="detail-section">
        <h3>Deadline</h3>
        <p>
          {card.type === 'draft' ? 'New draft limit: 4 days' : 'Revision limit: 2 days'} ·{' '}
          <span className={`deadline-pill ${deadline.tone}`} style={{ display: 'inline-flex' }}>
            <Icon id="i-clock" />{deadline.label}
          </span>
        </p>
      </section>
      <section className="detail-section activity-section">
        <h3>Activity</h3>
        {activity.map((entry) => (
          <div className="activity" key={entry.id}>
            <img src={entry.avatar} alt={entry.author} />
            <p><strong>{entry.author}</strong> {entry.text}</p>
            <time>{entry.time}</time>
          </div>
        ))}
      </section>
      <form
        className="comment-box"
        onSubmit={(e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          onAddComment(comment.trim());
          setComment('');
        }}
      >
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          aria-label="Add a comment"
        />
        <button type="submit" aria-label="Send comment"><Icon id="i-send" /></button>
      </form>
    </aside>
  );
}
