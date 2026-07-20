import { useMemo, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import KanbanColumn from './KanbanColumn.jsx';
import CardDrawer from './CardDrawer.jsx';
import NewCardModal from './NewCardModal.jsx';
import { productionCardsSeed, productionStages } from '../../data/mockData.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { useToast } from '../../context/ToastContext.jsx';

let nextId = 1000;

export default function KanbanBoard() {
  const { showToast } = useToast();
  const [cards, setCards] = useState(() => productionCardsSeed.map((c) => ({ ...c })));
  const [selectedId, setSelectedId] = useState(productionCardsSeed[3]?.id ?? null);
  const [draggingId, setDraggingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState('new_draft');
  const [activityByCard, setActivityByCard] = useState({});

  const selectedCard = cards.find((c) => c.id === selectedId) || null;
  const selectedStage = productionStages.find((s) => s.id === selectedCard?.stage);

  function visibleCards(stageId) {
    const q = query.toLowerCase().trim();
    return cards.filter((card) => {
      if (card.stage !== stageId) return false;
      if (q && !`${card.title} ${card.client}`.toLowerCase().includes(q)) return false;
      if (filter === 'priority') return card.priority;
      if (filter === 'revision') return card.type === 'revision';
      if (filter === 'overdue') return getDeadlineInfo(card.dueDate).tone === 'overdue';
      return true;
    });
  }

  function handleSelect(id) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  function handleDragStart(e, card) {
    e.dataTransfer.setData('text/plain', String(card.id));
    setDraggingId(card.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  function handleDrop(stageId) {
    if (draggingId == null) return;
    setCards((prev) => {
      const card = prev.find((c) => c.id === draggingId);
      if (!card || card.stage === stageId) return prev;
      const fromTitle = productionStages.find((s) => s.id === card.stage)?.title;
      showToast(`Moved "${card.title}" from ${fromTitle}`);
      return prev.map((c) => (c.id === draggingId ? { ...c, stage: stageId } : c));
    });
    setDraggingId(null);
  }

  function handleAddCard(stageId) {
    setModalStage(stageId);
    setModalOpen(true);
  }

  function handleCreateCard(form) {
    const id = nextId++;
    const createdAt = new Date().toISOString();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (form.type === 'draft' ? 4 : 2));
    const card = {
      id,
      stage: form.stage,
      type: form.type,
      title: form.title.trim(),
      client: form.client.trim(),
      assignee: form.assignee,
      createdAt,
      dueDate: dueDate.toISOString(),
      priority: form.priority,
      comments: 0,
      attachments: 0,
      description: 'New production item created from the Nexora portal.',
    };
    setCards((prev) => [...prev, card]);
    setSelectedId(id);
    setDrawerOpen(true);
    setModalOpen(false);
    showToast('New production card created');
  }

  function handleAddComment(text) {
    if (!selectedCard) return;
    setActivityByCard((prev) => ({
      ...prev,
      [selectedCard.id]: [
        { id: Date.now(), author: 'You', avatar: '/assets/avatar-jane.svg', text, time: 'now' },
        ...(prev[selectedCard.id] || defaultActivity(selectedCard)),
      ],
    }));
    showToast('Comment added');
  }

  const activity = selectedCard ? (activityByCard[selectedCard.id] || defaultActivity(selectedCard)) : [];

  const filters = useMemo(() => ([
    { id: 'all', label: 'All cards' },
    { id: 'priority', label: 'High priority' },
    { id: 'revision', label: 'Revisions' },
    { id: 'overdue', label: 'Overdue' },
  ]), []);

  return (
    <section className="board-section">
      <div className="board-heading-row">
        <div className="board-title-wrap"><h2>Production Board</h2></div>
        <div className="board-tools">
          <label className="search-box" style={{ width: 170 }}>
            <Icon id="i-search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search cards..." />
          </label>
          <button className="tool-btn" onClick={() => setFilterOpen((v) => !v)}>
            <Icon id="i-filter" /><span>Filter</span>
          </button>
          <button className="primary-btn" onClick={() => handleAddCard('new_draft')}>
            New Card <Icon id="i-plus" />
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="filter-strip">
          {filters.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="kanban">
        {productionStages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            cards={visibleCards(stage.id)}
            selectedId={selectedId}
            draggingId={draggingId}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onAddCard={handleAddCard}
          />
        ))}
      </div>

      <CardDrawer
        card={selectedCard}
        stage={selectedStage}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activity={activity}
        onAddComment={handleAddComment}
      />
      {drawerOpen && <div className="scrim visible" onClick={() => setDrawerOpen(false)} />}

      <NewCardModal
        open={modalOpen}
        stages={productionStages}
        defaultStage={modalStage}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateCard}
      />
    </section>
  );
}

function defaultActivity(card) {
  return [
    { id: 'seed-1', author: card.assignee.name, avatar: card.assignee.avatar, text: `moved this card into ${card.stage.replace('_', ' ')}`, time: '2h ago' },
  ];
}
