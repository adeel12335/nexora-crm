import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import KanbanColumn from './KanbanColumn.jsx';
import CardDrawer from './CardDrawer.jsx';
import NewCardModal from './NewCardModal.jsx';
import { avatarPool, productionStages } from '../../data/mockData.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { isHighPriority } from '../../utils/boardValidation.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

let nextId = 1000;
let nextFileId = 5000;

function toAssignee(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: avatarPool[Number(user.id) % avatarPool.length],
  };
}

function hydrateCard(card) {
  return {
    ...card,
    priority: card.priority === true ? 'high' : (card.priority || 'none'),
    commentList: (card.commentList || []).map((c) => ({ ...c, kind: c.kind || 'comment' })),
    fileList: (card.fileList || []).map((f) => ({ ...f })),
    feedback: card.feedback || { status: 'none', note: '', rating: null, updatedAt: null, author: null },
    comments: card.commentList?.length ?? card.comments ?? 0,
    attachments: card.fileList?.length ?? card.attachments ?? 0,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function KanbanBoard() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [cards, setCards] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState('new_draft');
  const [mobileStage, setMobileStage] = useState(productionStages[0].id);
  const [activityByCard, setActivityByCard] = useState({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.listUsers(token, '?includeInactive=0&pageSize=100');
        const users = (data.users || data || []).filter((u) =>
          ['agent', 'manager', 'production', 'admin'].includes(u.role)
        );
        if (!cancelled) setAssignees(users.map(toAssignee));
      } catch {
        if (!cancelled && user) {
          setAssignees([toAssignee({ id: user.id, name: user.name, email: user.email })]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  const selectedCard = cards.find((c) => c.id === selectedId) || null;
  const selectedStage = productionStages.find((s) => s.id === selectedCard?.stage);

  function pushActivity(cardId, text, author = 'You', avatar = '/assets/avatar-jane.svg') {
    setActivityByCard((prev) => ({
      ...prev,
      [cardId]: [
        { id: Date.now() + Math.random(), kind: 'system', author, avatar, text, time: 'now' },
        ...(prev[cardId] || []),
      ],
    }));
  }

  function patchCard(cardId, patch) {
    setCards((prev) => prev.map((item) => {
      if (item.id !== cardId) return item;
      const next = { ...item, ...patch };
      if (patch.commentList) next.comments = patch.commentList.length;
      if (patch.fileList) next.attachments = patch.fileList.length;
      return next;
    }));
  }

  function visibleCards(stageId) {
    const q = query.toLowerCase().trim();
    return cards.filter((card) => {
      if (card.stage !== stageId) return false;
      if (q && !`${card.title} ${card.client}`.toLowerCase().includes(q)) return false;
      if (filter === 'priority') return isHighPriority(card.priority) || card.priority === 'medium';
      if (filter === 'revision') return card.type === 'revision';
      if (filter === 'overdue') return getDeadlineInfo(card.dueDate).tone === 'overdue';
      if (filter === 'live') return card.stage === 'live';
      if (filter === 'feedback') return card.feedback?.status && card.feedback.status !== 'none';
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

  function moveCard(cardId, stageId) {
    const card = cards.find((item) => item.id === cardId);
    if (!card || card.stage === stageId) return;
    const fromTitle = productionStages.find((stage) => stage.id === card.stage)?.title;
    const toTitle = productionStages.find((stage) => stage.id === stageId)?.title;
    setCards((previous) => previous.map((item) => (item.id === cardId ? { ...item, stage: stageId } : item)));
    pushActivity(cardId, `moved this card from ${fromTitle} to ${toTitle}`);
    showToast(`Moved "${card.title}" → ${toTitle}`);
  }

  function handleDrop(stageId) {
    if (draggingId == null) return;
    moveCard(draggingId, stageId);
    setDraggingId(null);
  }

  function handleAddCard(stageId) {
    setModalStage(stageId);
    setModalOpen(true);
  }

  function handleCreateCard(form) {
    const id = nextId++;
    const createdAt = new Date().toISOString();
    const card = hydrateCard({
      id,
      stage: form.stage,
      type: form.type,
      title: form.title.trim(),
      client: form.client.trim(),
      assignee: form.assignee,
      createdAt,
      dueDate: form.dueDate,
      priority: form.priority || 'none',
      commentList: [],
      fileList: [],
      description: String(form.description || '').trim() || 'New production item created from The Wiki Studio portal.',
      feedback: { status: 'none', note: '', rating: null, updatedAt: null, author: null },
    });
    setCards((prev) => [...prev, card]);
    setSelectedId(id);
    setDrawerOpen(true);
    setModalOpen(false);
    pushActivity(id, 'created this card');
    showToast('New production card created');
  }

  function handleUpdateCard(cardId, patch) {
    patchCard(cardId, patch);
    pushActivity(cardId, 'updated card details');
    showToast('Card updated');
  }

  function handleAddComment(text) {
    if (!selectedCard) return;
    const entry = {
      id: Date.now(),
      kind: 'comment',
      author: 'You',
      avatar: '/assets/avatar-jane.svg',
      text,
      time: 'now',
      createdAt: new Date().toISOString(),
    };
    const commentList = [entry, ...(selectedCard.commentList || [])];
    patchCard(selectedCard.id, { commentList });
    showToast('Comment added');
  }

  async function handleUploadFiles(cardId, files) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    try {
      const uploaded = await Promise.all(files.map(async (file) => ({
        id: nextFileId++,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url: await readFileAsDataUrl(file),
        uploadedAt: new Date().toISOString(),
      })));
      const fileList = [...uploaded, ...(card.fileList || [])];
      patchCard(cardId, { fileList });
      pushActivity(cardId, `uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`);
      showToast(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      showToast(err.message || 'Upload failed');
    }
  }

  function handleRemoveFile(cardId, fileId) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const removed = (card.fileList || []).find((f) => f.id === fileId);
    const fileList = (card.fileList || []).filter((f) => f.id !== fileId);
    patchCard(cardId, { fileList });
    if (removed) pushActivity(cardId, `removed ${removed.name}`);
    showToast('Attachment removed');
  }

  function handleSaveFeedback(cardId, feedback) {
    patchCard(cardId, { feedback });
    pushActivity(cardId, `set feedback to "${feedback.status.replaceAll('_', ' ')}"`);
    showToast('Feedback saved');
  }

  const comments = selectedCard?.commentList || [];
  const activity = selectedCard
    ? (activityByCard[selectedCard.id] || defaultActivity(selectedCard))
    : [];

  const filters = useMemo(() => ([
    { id: 'all', label: 'All cards' },
    { id: 'priority', label: 'Priority' },
    { id: 'live', label: 'Live' },
    { id: 'revision', label: 'Revisions' },
    { id: 'feedback', label: 'Has feedback' },
    { id: 'overdue', label: 'Overdue' },
  ]), []);

  return (
    <section className="board-section">
      <div className="board-heading-row">
        <div className="board-title-wrap">
          <h2>Production Board</h2>
          <span className="board-live-badge">Includes Live stage</span>
        </div>
        <div className="board-tools">
          <label className="search-box" style={{ width: 170 }}>
            <Icon id="i-search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search cards..." />
          </label>
          <button type="button" className="tool-btn" onClick={() => setFilterOpen((v) => !v)}>
            <Icon id="i-filter" /><span>Filter</span>
          </button>
          <button type="button" className="primary-btn" onClick={() => handleAddCard('new_draft')}>
            New Card <Icon id="i-plus" />
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="filter-strip">
          {filters.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <label className="mobile-stage-picker">
        Production stage
        <select value={mobileStage} onChange={(event) => setMobileStage(event.target.value)}>
          {productionStages.map((stage) => (
            <option key={stage.id} value={stage.id}>{stage.title} ({visibleCards(stage.id).length})</option>
          ))}
        </select>
      </label>

      <div className="kanban kanban-six">
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
            mobileActive={stage.id === mobileStage}
          />
        ))}
      </div>

      <CardDrawer
        card={selectedCard}
        stage={selectedStage}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activity={activity}
        comments={comments}
        onAddComment={handleAddComment}
        onUpdateCard={handleUpdateCard}
        onUploadFiles={handleUploadFiles}
        onRemoveFile={handleRemoveFile}
        onSaveFeedback={handleSaveFeedback}
        stages={productionStages}
        assignees={assignees}
        onMove={(stageId) => selectedCard && moveCard(selectedCard.id, stageId)}
      />
      {drawerOpen && <div className="scrim visible" onClick={() => setDrawerOpen(false)} />}

      <NewCardModal
        open={modalOpen}
        stages={productionStages}
        assignees={assignees}
        defaultStage={modalStage}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateCard}
      />
    </section>
  );
}

function defaultActivity(card) {
  return card?.assignee
    ? [{
        id: 'seed-1',
        kind: 'system',
        author: card.assignee.name,
        avatar: card.assignee.avatar,
        text: `card is in ${card.stage.replaceAll('_', ' ')}`,
        time: 'now',
      }]
    : [];
}
