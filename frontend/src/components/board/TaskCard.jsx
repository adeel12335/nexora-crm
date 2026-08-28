import { useRef } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import { priorityLabel } from '../../utils/boardValidation.js';
import { isLiveLikeStage } from '../../data/productionStages.js';

const DRAFT_SUFFIX = /\s*[—–-]\s*new draft\s*$/i;

function displayClientName(card) {
  const client = String(card.client || '').trim();
  if (client) return client;
  const title = String(card.title || '').replace(DRAFT_SUFFIX, '').trim();
  return title || 'Untitled';
}

export default function TaskCard({
  card,
  stageColor,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  dragging,
  dropBefore,
  unreadCount = 0,
}) {
  const draggedRef = useRef(false);
  const comments = card.comments || card.commentList?.length || 0;
  const attachments = card.attachments || card.fileList?.length || 0;
  const feedback = card.feedback?.status;
  const priority = card.priority;
  const showPriority = priority && priority !== 'none';
  const liveUrl = String(card.liveUrl || '').trim();
  const liveLike = isLiveLikeStage(card.stage);
  const name = displayClientName(card);
  const hasMeta = unreadCount > 0 || comments > 0 || attachments > 0;
  const hasTags = Boolean(
    (showPriority && priority !== 'none')
    || (feedback && feedback !== 'none')
    || (liveLike && liveUrl),
  );

  function handleClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onSelect(card.id);
  }

  return (
    <article
      className={`task-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${liveLike ? ' is-live' : ''}${unreadCount > 0 ? ' has-unread' : ''}${dropBefore ? ' drop-before' : ''}`}
      style={{ '--stage': stageColor }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${name} details${unreadCount > 0 ? `, ${unreadCount} unread updates` : ''}`}
      draggable
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(card.id);
        }
      }}
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(card.id));
        onDragStart(e, card);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        onCardDragOver?.(e.clientY > rect.top + rect.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCardDrop?.(e, card);
      }}
    >
      {showPriority ? (
        <span className={`priority-flag priority-${priority === true ? 'high' : priority}`} />
      ) : null}

      <div className="card-top">
        <strong>{name}</strong>
      </div>

      {card.clientAgentName ? (
        <div className="card-people">
          <span className="card-owner">Client of {card.clientAgentName}</span>
        </div>
      ) : null}

      {hasTags ? (
        <div className="card-tags">
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
      ) : null}

      {hasMeta ? (
        <div className="card-bottom">
          <div className="card-meta">
            {unreadCount > 0 ? (
              <span
                className="card-updates"
                title={`${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'}`}
              >
                <Icon id="i-bell" />
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
            {comments > 0 ? (
              <span title={`${comments} comments`}><Icon id="i-message" />{comments}</span>
            ) : null}
            {attachments > 0 ? (
              <span title={`${attachments} files`}><Icon id="i-paperclip" />{attachments}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
