import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import FancySelect from '../filters/FancySelect.jsx';
import KanbanColumn from './KanbanColumn.jsx';
import CardDrawer from './CardDrawer.jsx';
import NewCardModal from './NewCardModal.jsx';
import { avatarPool, productionStages } from '../../data/mockData.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { isHighPriority, validateFiles, MAX_FILES_PER_CARD } from '../../utils/boardValidation.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

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
    liveUrl: card.liveUrl || '',
    clientId: card.clientId ?? null,
    clientAgentName: card.clientAgentName || null,
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

function hasLiveLink(card) {
  return Boolean(String(card?.liveUrl || '').trim());
}

export default function KanbanBoard() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const canCreateCards = isAdmin;
  const canDeleteCards = isAdmin;
  const canEditCardMeta = isAdmin;
  const [cards, setCards] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [crmClients, setCrmClients] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const loadCards = useCallback(async () => {
    if (!token) return;
    const data = await api.listProductionCards(token);
    setCards((data.cards || []).map(hydrateCard));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Production role cannot list users — never fail the whole board on that.
        const cardsPromise = api.listProductionCards(token);
        const metaPromise = isAdmin
          ? Promise.all([
              api.listUsers(token, '?includeInactive=0&pageSize=200'),
              api.listClients(token, { pageSize: 500 }),
            ])
          : Promise.resolve([null, null]);

        const [cardsData, meta] = await Promise.all([cardsPromise, metaPromise]);
        if (cancelled) return;

        setCards((cardsData.cards || []).map(hydrateCard));

        if (isAdmin) {
          const [usersData, clientsData] = meta;
          const users = (usersData.users || usersData || []).filter((u) =>
            u.isActive !== false && u.role === 'production'
          );
          setAssignees(users.map(toAssignee));
          setCrmClients((clientsData.clients || []).filter((c) => c.isActive !== false));
        } else if (user) {
          setAssignees([toAssignee({ id: user.id, name: user.name, email: user.email })]);
          setCrmClients([]);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err.message || 'Could not load board');
          if (user) setAssignees([toAssignee({ id: user.id, name: user.name, email: user.email })]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, user, isAdmin, showToast]);

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

  function replaceCard(updated) {
    const next = hydrateCard(updated);
    setCards((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    return next;
  }

  async function persistCard(cardId, patch) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return null;
    const body = {
      title: patch.title ?? card.title,
      client: patch.client ?? card.client,
      clientId: patch.clientId !== undefined ? patch.clientId : card.clientId,
      type: patch.type ?? card.type,
      stage: patch.stage ?? card.stage,
      assigneeId: patch.assignee?.id ?? patch.assigneeId ?? card.assignee.id,
      priority: patch.priority ?? card.priority,
      description: patch.description !== undefined ? patch.description : card.description,
      dueDate: patch.dueDate ?? card.dueDate,
      liveUrl: patch.liveUrl !== undefined ? patch.liveUrl : card.liveUrl,
      commentList: patch.commentList ?? card.commentList,
      fileList: patch.fileList ?? card.fileList,
      feedback: patch.feedback ?? card.feedback,
    };
    const data = await api.updateProductionCard(token, cardId, body);
    return replaceCard(data.card);
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
    // Hydrate full card (file data URLs) in background after light list load.
    api.getProductionCard(token, id)
      .then((data) => {
        if (data?.card) replaceCard(data.card);
      })
      .catch(() => {});
  }

  function handleDragStart(e, card) {
    e.dataTransfer.setData('text/plain', String(card.id));
    setDraggingId(card.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  async function moveCard(cardId, stageId) {
    const card = cards.find((item) => item.id === cardId);
    if (!card || card.stage === stageId) return;

    if (stageId === 'live' && !hasLiveLink(card)) {
      showToast('Add the live link on the card first, then move to Live');
      handleSelect(cardId);
      return;
    }

    const fromTitle = productionStages.find((stage) => stage.id === card.stage)?.title;
    const toTitle = productionStages.find((stage) => stage.id === stageId)?.title;
    try {
      await persistCard(cardId, { stage: stageId });
      pushActivity(cardId, `moved this card from ${fromTitle} to ${toTitle}`);
      showToast(`Moved "${card.title}" → ${toTitle}`);
    } catch (err) {
      showToast(err.message || 'Could not move card');
    }
  }

  function handleDrop(stageId) {
    if (draggingId == null) return;
    moveCard(draggingId, stageId);
    setDraggingId(null);
  }

  function handleAddCard(stageId) {
    if (!canCreateCards) {
      showToast('Only admin can create production cards');
      return;
    }
    setModalStage(stageId);
    setModalOpen(true);
  }

  async function handleCreateCard(form) {
    const createdAt = new Date().toISOString();
    const rawFiles = Array.from(form.files || []);
    let fileList = [];
    if (rawFiles.length) {
      try {
        fileList = await Promise.all(rawFiles.map(async (file) => ({
          id: nextFileId++,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          url: await readFileAsDataUrl(file),
          uploadedAt: createdAt,
        })));
      } catch (err) {
        showToast(err.message || 'Could not attach files');
        throw err;
      }
    }

    try {
      const data = await api.createProductionCard(token, {
        title: form.title.trim(),
        client: form.client.trim(),
        clientId: form.clientId || null,
        type: form.type,
        stage: form.stage,
        assigneeId: form.assignee?.id || form.assigneeId,
        priority: form.priority || 'none',
        description: String(form.description || '').trim() || 'New production item created from The Wiki Studio portal.',
        dueDate: form.dueDate,
        liveUrl: form.liveUrl || '',
        fileList,
        commentList: [],
      });
      const card = hydrateCard(data.card);
      setCards((prev) => [...prev, card]);
      setSelectedId(card.id);
      setDrawerOpen(true);
      setModalOpen(false);
      pushActivity(card.id, 'created this card');
      if (fileList.length) {
        pushActivity(card.id, `uploaded ${fileList.length} file${fileList.length > 1 ? 's' : ''}`);
      }
      showToast(
        fileList.length
          ? `Card created with ${fileList.length} file${fileList.length > 1 ? 's' : ''}`
          : 'New production card created',
      );
    } catch (err) {
      showToast(err.message || 'Could not create card');
      throw err;
    }
  }

  async function handleUpdateCard(cardId, patch) {
    try {
      await persistCard(cardId, patch);
      pushActivity(cardId, 'updated card details');
      showToast('Card updated');
      return true;
    } catch (err) {
      showToast(err.message || 'Could not update card');
      return false;
    }
  }

  async function handleDeleteCard(cardId) {
    const card = cards.find((c) => c.id === cardId);
    try {
      await api.deleteProductionCard(token, cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setSelectedId(null);
      setDrawerOpen(false);
      showToast(card ? `Deleted "${card.title}"` : 'Card deleted');
      return true;
    } catch (err) {
      showToast(err.message || 'Could not delete card');
      return false;
    }
  }

  async function handleAddComment(text) {
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
    try {
      await persistCard(selectedCard.id, { commentList });
      pushActivity(selectedCard.id, 'added a comment');
    } catch (err) {
      showToast(err.message || 'Could not save comment');
    }
  }

  async function handleUploadFiles(cardId, files) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const existing = card.fileList || [];
    const existingBytes = existing.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const { ok, errors } = validateFiles(files, existing.length, existingBytes);
    if (!ok.length) {
      showToast(errors[0] || 'Upload blocked');
      return;
    }
    if (errors.length) showToast(errors[0]);
    try {
      const uploaded = await Promise.all(ok.map(async (file) => ({
        id: nextFileId++,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url: await readFileAsDataUrl(file),
        uploadedAt: new Date().toISOString(),
      })));
      const fileList = [...uploaded, ...existing].slice(0, MAX_FILES_PER_CARD);
      await persistCard(cardId, { fileList });
      pushActivity(cardId, `uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`);
      showToast(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      showToast(err.message || 'Upload failed');
    }
  }

  async function handleRemoveFile(cardId, fileId) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const removed = (card.fileList || []).find((f) => f.id === fileId);
    const fileList = (card.fileList || []).filter((f) => f.id !== fileId);
    try {
      await persistCard(cardId, { fileList });
      if (removed) pushActivity(cardId, `removed ${removed.name}`);
      showToast('Attachment removed');
    } catch (err) {
      showToast(err.message || 'Could not remove file');
    }
  }

  async function handleSaveFeedback(cardId, feedback) {
    try {
      await persistCard(cardId, { feedback });
      pushActivity(cardId, `set feedback to "${feedback.status.replaceAll('_', ' ')}"`);
      showToast('Feedback saved');
      return true;
    } catch (err) {
      showToast(err.message || 'Could not save feedback');
      return false;
    }
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
          {canCreateCards ? (
            <button type="button" className="primary-btn" onClick={() => handleAddCard('new_draft')}>
              New Card <Icon id="i-plus" />
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="commission-note">Loading board…</p> : null}

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
        <FancySelect
          fullWidth
          value={mobileStage}
          onChange={setMobileStage}
          options={productionStages.map((stage) => ({
            value: stage.id,
            label: `${stage.title} (${visibleCards(stage.id).length})`,
          }))}
        />
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
            onAddCard={canCreateCards ? handleAddCard : null}
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
        onDeleteCard={canDeleteCards ? handleDeleteCard : null}
        canEditMeta={canEditCardMeta}
        onUploadFiles={handleUploadFiles}
        onRemoveFile={handleRemoveFile}
        onSaveFeedback={handleSaveFeedback}
        stages={productionStages}
        assignees={assignees}
        crmClients={crmClients}
        onMove={(stageId) => selectedCard && moveCard(selectedCard.id, stageId)}
      />
      {drawerOpen && <div className="scrim visible" onClick={() => setDrawerOpen(false)} />}

      {canCreateCards ? (
        <NewCardModal
          open={modalOpen}
          stages={productionStages}
          assignees={assignees}
          crmClients={crmClients}
          defaultStage={modalStage}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreateCard}
        />
      ) : null}
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
