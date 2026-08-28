import { useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import TaskCard from './TaskCard.jsx';

export default function KanbanColumn({
  stage,
  cards,
  selectedId,
  draggingId,
  dropIndex,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
  onCardDragOver,
  onAddCard,
  unreadByCard = {},
  mobileActive,
}) {
  const [dragOver, setDragOver] = useState(false);
  const canAdd = typeof onAddCard === 'function';
  const dropAtEnd = draggingId != null && dropIndex === cards.length;

  return (
    <section className={`kanban-column${dragOver ? ' drag-over' : ''}${mobileActive ? '' : ' mobile-hidden'}`} style={{ '--stage': stage.color }}>
      <header className="column-head">
        <span className="stage-dot" />
        <h3>{stage.title}</h3>
        <span className="column-count">{cards.length}</span>
        {canAdd ? (
          <button className="column-add" aria-label={`Add to ${stage.title}`} onClick={() => onAddCard(stage.id)}>
            <Icon id="i-plus" />
          </button>
        ) : null}
      </header>
      <div
        className={`card-list${dropAtEnd ? ' drop-end' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOver(true);
          if (e.target === e.currentTarget) {
            onCardDragOver?.(stage.id, cards.length);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onDrop(stage.id);
        }}
      >
        {cards.length ? cards.map((card, index) => (
          <TaskCard
            key={card.id}
            card={card}
            stageColor={stage.color}
            selected={card.id === selectedId}
            dragging={card.id === draggingId}
            dropBefore={draggingId != null && dropIndex === index && card.id !== draggingId}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardDragOver={(after) => onCardDragOver?.(stage.id, after ? index + 1 : index)}
            onCardDrop={() => onDrop(stage.id)}
            unreadCount={Number(unreadByCard[String(card.id)] || 0)}
          />
        )) : <div className="empty-state">No matching cards</div>}
      </div>
      {canAdd ? (
        <button className="add-card-row" onClick={() => onAddCard(stage.id)}>
          <Icon id="i-plus" /> Add another card
        </button>
      ) : null}
    </section>
  );
}
