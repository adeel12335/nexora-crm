import { Icon } from '../../icons/IconSprite.jsx';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';

export default function TaskCard({ card, stageColor, selected, onSelect, onDragStart, onDragEnd, dragging }) {
  const deadline = getDeadlineInfo(card.dueDate);

  return (
    <article
      className={`task-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--stage': stageColor }}
      draggable
      onClick={() => onSelect(card.id)}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
    >
      {card.priority && <span className="priority-flag" />}
      <div className="card-top">
        <strong>{card.title}</strong>
        <button className="card-menu" aria-label="Card actions" onClick={(e) => e.stopPropagation()}>
          <Icon id="i-more" />
        </button>
      </div>
      <a className="company" href="#!" onClick={(e) => e.preventDefault()}>{card.client}</a>
      <div className="card-bottom">
        <img src={card.assignee.avatar} alt={card.assignee.name} />
        <div className="card-meta">
          <span className={`type-pill ${card.type}`}>{card.type === 'draft' ? 'Draft' : 'Revision'}</span>
          {card.comments ? <span><Icon id="i-message" />{card.comments}</span> : null}
          {card.attachments ? <span><Icon id="i-paperclip" />{card.attachments}</span> : null}
          <span className={`deadline-pill ${deadline.tone}`}>
            <Icon id="i-clock" />{deadline.label}
          </span>
        </div>
      </div>
    </article>
  );
}
