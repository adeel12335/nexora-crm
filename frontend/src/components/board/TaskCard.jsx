import { Icon } from '../../icons/IconSprite.jsx';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { priorityLabel } from '../../utils/boardValidation.js';
import { isLiveLikeStage } from '../../data/productionStages.js';
import Avatar from './Avatar.jsx';

/** "2h ago" / "3d ago" for the last comment or edit on the card. */
function relativeTime(value) {
  const t = value ? new Date(value).getTime() : 0;
  if (!t || Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function TaskCard({
  card,
  stageColor,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  dragging,
  unreadCount = 0,
  activityAt = null,
}) {
  const deadline = getDeadlineInfo(card.dueDate);
  const comments = card.comments || card.commentList?.length || 0;
  const attachments = card.attachments || card.fileList?.length || 0;
  const feedback = card.feedback?.status;
  const priority = card.priority;
  const showPriority = priority && priority !== 'none';
  const liveUrl = String(card.liveUrl || '').trim();
  const liveLike = isLiveLikeStage(card.stage);
  const touched = relativeTime(activityAt || card.updatedAt || card.createdAt);
  const title = String(card.title || '').trim();
  const clientName = String(card.client || '').trim();
  // Avoid "John / John" when Trello-imported titles are just the client name.
  const showClientLine = clientName && clientName.toLowerCase() !== title.toLowerCase()
    && !title.toLowerCase().startsWith(`${clientName.toLowerCase()} —`)
    && !title.toLowerCase().startsWith(`${clientName.toLowerCase()} -`);

  return (
    <article
      className={`task-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${liveLike ? ' is-live' : ''}${unreadCount > 0 ? ' has-unread' : ''}`}
      style={{ '--stage': stageColor }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${card.title} details${unreadCount > 0 ? `, ${unreadCount} unread updates` : ''}`}
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
      {showPriority ? (
        <span className={`priority-flag priority-${priority === true ? 'high' : priority}`} />
      ) : null}

      <div className="card-top">
        <strong>{title || 'Untitled'}</strong>
        {unreadCount > 0 ? (
          <span
            className="card-updates"
            title={`${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'}`}
          >
            <Icon id="i-bell" />
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </div>

      <div className="card-people">
        {showClientLine ? <span className="company">{clientName}</span> : null}
        {card.clientAgentName ? (
          <span className="card-owner">Client of {card.clientAgentName}</span>
        ) : null}
      </div>
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
        <Avatar name={card.assignee?.name} size={26} />
        <div className="card-meta">
          {comments > 0 ? (
            <span title={`${comments} comments`}><Icon id="i-message" />{comments}</span>
          ) : null}
          {attachments > 0 ? (
            <span title={`${attachments} files`}><Icon id="i-paperclip" />{attachments}</span>
          ) : null}
          <span className={`deadline-pill ${deadline.tone}`}>
            <Icon id="i-clock" />{deadline.label}
          </span>
        </div>
      </div>

      {touched ? <span className="card-touched">Updated {touched}</span> : null}
    </article>
  );
}
