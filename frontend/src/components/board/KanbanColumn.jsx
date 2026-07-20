import { useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import TaskCard from './TaskCard.jsx';

export default function KanbanColumn({ stage, cards, selectedId, draggingId, onSelect, onDragStart, onDragEnd, onDrop, onAddCard, mobileActive }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <section className={`kanban-column${dragOver ? ' drag-over' : ''}${mobileActive ? '' : ' mobile-hidden'}`} style={{ '--stage': stage.color }}>
      <header className="column-head">
        <span className="stage-dot" />
        <h3>{stage.title}</h3>
        <span className="column-count">{cards.length}</span>
        <button className="column-add" aria-label={`Add to ${stage.title}`} onClick={() => onAddCard(stage.id)}>
          <Icon id="i-plus" />
        </button>
      </header>
      <div
        className="card-list"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(stage.id); }}
      >
        {cards.length ? cards.map((card) => (
          <TaskCard
            key={card.id}
            card={card}
            stageColor={stage.color}
            selected={card.id === selectedId}
            dragging={card.id === draggingId}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        )) : <div className="empty-state">No matching cards</div>}
      </div>
      <button className="add-card-row" onClick={() => onAddCard(stage.id)}>
        <Icon id="i-plus" /> Add another card
      </button>
    </section>
  );
}
