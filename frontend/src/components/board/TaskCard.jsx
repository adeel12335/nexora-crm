import { Icon } from '../../icons/IconSprite.jsx';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { isHighPriority, priorityLabel } from '../../utils/boardValidation.js';
import { isLiveLikeStage } from '../../data/productionStages.js';

export default function TaskCard({ card, stageColor, selected, onSelect, onDragStart, onDragEnd, dragging }) {
  const deadline = getDeadlineInfo(card.dueDate);
  const comments = card.comments || card.commentList?.length || 0;
  const attachments = card.attachments || card.fileList?.length || 0;
  const feedback = card.feedback?.status;
  const priority = card.priority;
  const showPriority = priority && priority !== 'none';
  const liveUrl = String(card.liveUrl || '').trim();
  const liveLike = isLiveLikeStage(card.stage);

  return (
    <article
      className={`task-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${liveLike ? ' is-live' : ''}`}
      style={{ '--stage': stageColor }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${card.title} details`}
      draggable
      onClick={() => onSelect(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(card.id);
        }
      }}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
    >
      {isHighPriority(priority) && <span className="priority-flag" />}
      {showPriority && !isHighPriority(priority) && (
        <span className={`priority-flag priority-${priority}`} />
      )}

      <div className="card-top">
        <strong>{card.title}</strong>
      </div>
      <span className="company">{card.client}</span>
      {card.clientAgentName ? (
        <span className="card-owner">Client of {card.clientAgentName}</span>
      ) : null}

      <div className="card-tags">
        <span className={`type-pill ${card.type}`}>{card.type === 'draft' ? 'Draft' : 'Revision'}</span>
        {showPriority ? (
          <span className={`priority-pill priority-${priority === true ? 'high' : priority}`}>
            {priorityLabel(priority)}
          </span>
        ) : null}
        {feedback && feedback !== 'none' ? (
          <span className={`feedback-pill feedback-${feedback}`}>
            {feedback === 'approved' ? 'Approved' : feedback === 'changes_requested' ? 'Changes' : 'Pending'}
          </span>
        ) : null}
        {liveLike && liveUrl ? (
          <a
            className="live-pill"
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={liveUrl}
          >
            <Icon id="i-link" /> Live
          </a>
        ) : null}
      </div>

      <div className="card-bottom">
        <img src={card.assignee.avatar} alt="" />
        <div className="card-meta">
          {comments > 0 && <span title="Comments"><Icon id="i-message" />{comments}</span>}
          {attachments > 0 && <span title="Files"><Icon id="i-paperclip" />{attachments}</span>}
          <span className={`deadline-pill ${deadline.tone}`}>
            <Icon id="i-clock" />{deadline.label}
          </span>
        </div>
      </div>
    </article>
  );
}
