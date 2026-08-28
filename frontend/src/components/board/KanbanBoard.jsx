import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../icons/IconSprite.jsx';
import KanbanColumn from './KanbanColumn.jsx';
import CardDrawer from './CardDrawer.jsx';
import NewCardModal from './NewCardModal.jsx';
import { avatarPool, productionStages } from '../../data/mockData.js';
import { requiresLiveLink, isLiveLikeStage, normalizeProductionStage } from '../../data/productionStages.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { isHighPriority, validateFiles, MAX_FILES_PER_CARD } from '../../utils/boardValidation.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

let localSeq = 0;

/**
 * Id for an optimistic row. Must not repeat across page loads: a counter that
 * restarts at a fixed number hands two different comments the same id, and then
 * edit / delete hits both of them.
 */
function localId(prefix) {
  localSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${localSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

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
    stage: normalizeProductionStage(card.stage),
    priority: card.priority === true ? 'high' : (card.priority || 'none'),
    liveUrl: card.liveUrl || '',
    clientId: card.clientId ?? null,
    clientAgentName: card.clientAgentName || null,
    commentList: (card.commentList || []).map((c) => ({ ...c, kind: c.kind || 'comment' })),
    fileList: (card.fileList || []).map((f) => ({ ...f })),
    deliveryList: (card.deliveryList || []).map((d) => ({ ...d })),
    feedback: card.feedback || { status: 'none', note: '', rating: null, updatedAt: null, author: null },
    comments: card.commentList?.length ?? card.comments ?? 0,
    attachments: card.fileList?.length ?? card.attachments ?? 0,
    sortOrder: Number(card.sortOrder || 0),
  };
}

/** Upload File objects one-by-one so a single stall cannot freeze the batch. */
async function uploadFilesToHost(token, files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return [];
  const hosted = [];
  for (const file of list) {
    const data = await api.uploadProductionFiles(token, [file]);
    hosted.push(...(data.files || []));
  }
  return hosted.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type || 'application/octet-stream',
    url: f.url,
    uploadedAt: f.uploadedAt || new Date().toISOString(),
  }));
}

function revokeBlobUrls(files) {
  for (const file of files || []) {
    const url = String(file?.url || '');
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function sortByBoardOrder(a, b) {
  const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  if (order) return order;
  return Number(a.id) - Number(b.id);
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
  const [dropTarget, setDropTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState(productionStages[0].id);
  const [activityByCard, setActivityByCard] = useState({});
  const [unreadByCard, setUnreadByCard] = useState({});
  const [hydratingId, setHydratingId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const cardsRef = useRef(cards);
  const saveChainsRef = useRef({});

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  /**
   * Single writer for board state. cardsRef is updated synchronously because
   * queued saves read it in a microtask, long before React flushes the effect
   * above — reading stale cards there dropped the comment being saved.
   */
  const commitCards = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(cardsRef.current) : updater;
    cardsRef.current = next;
    setCards(next);
    return next;
  }, []);

  const loadCards = useCallback(async () => {
    if (!token) return;
    const data = await api.listProductionCards(token);
    commitCards((data.cards || []).map(hydrateCard));
  }, [token, commitCards]);

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

        commitCards((cardsData.cards || []).map(hydrateCard));

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
  }, [token, user, isAdmin, showToast, commitCards]);

  const selectedCard = cards.find((c) => c.id === selectedId) || null;
  const selectedStage = productionStages.find((s) => s.id === selectedCard?.stage);

  function pushActivity(cardId, text, author = 'You', avatar = '/assets/avatar-jane.svg') {
    setActivityByCard((prev) => ({
      ...prev,
      [cardId]: [
        { id: Date.now() + Math.random(), kind: 'system', author, avatar, text, time: 'now', createdAt: new Date().toISOString() },
        ...(prev[cardId] || []),
      ],
    }));
  }

  function pruneCommentAddActivities(cardId) {
    setActivityByCard((prev) => {
      const list = prev[cardId];
      if (!list?.length) return prev;
      const next = list.filter((item) => {
        const text = String(item.text || '').trim();
        return text !== 'added a comment' && text !== 'added a comment with files';
      });
      if (next.length === list.length) return prev;
      return { ...prev, [cardId]: next };
    });
  }

  function replaceCard(updated) {
    const next = hydrateCard(updated);
    commitCards((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    return next;
  }

  function patchCardLocal(cardId, patch) {
    let nextCard = null;
    commitCards((prev) => prev.map((item) => {
      if (item.id !== cardId) return item;
      nextCard = hydrateCard({
        ...item,
        ...patch,
        comments: patch.commentList?.length ?? item.comments,
        attachments: patch.fileList?.length ?? item.attachments,
      });
      return nextCard;
    }));
    return nextCard;
  }

  function enqueueCardSave(cardId, task) {
    const prev = saveChainsRef.current[cardId] || Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    saveChainsRef.current[cardId] = next;
    return next;
  }

  async function persistCard(cardId, patch, { sync = true } = {}) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return null;
    const body = {
      title: patch.title ?? card.title,
      client: patch.client ?? card.client,
      clientId: patch.clientId !== undefined ? patch.clientId : card.clientId,
      type: patch.type ?? card.type,
      stage: patch.stage ?? card.stage,
      assigneeId: patch.assignee?.id ?? patch.assigneeId ?? card.assignee?.id,
      priority: patch.priority ?? card.priority,
      description: patch.description !== undefined ? patch.description : card.description,
      dueDate: patch.dueDate ?? card.dueDate,
      liveUrl: patch.liveUrl !== undefined ? patch.liveUrl : card.liveUrl,
    };
    // Only send extras the caller intends to change. Re-sending light list
    // payloads (data: URLs stripped) would wipe attachments / deliveries.
    // Existing data: URLs are omitted so PATCH stays small; the API restores
    // prior urls by file id.
    if ('commentList' in patch) {
      body.commentList = (patch.commentList || []).map(({ _pending, ...rest }) => ({
        ...rest,
        files: Array.isArray(rest.files)
          ? rest.files.map((f) => {
            if (_pending) return f;
            if (f?.url && String(f.url).startsWith('data:')) {
              const { url, ...meta } = f;
              return meta;
            }
            return f;
          })
          : rest.files,
      }));
    }
    if ('fileList' in patch) {
      body.fileList = (patch.fileList || []).map(({ _pending, ...rest }) => {
        if (_pending) return rest;
        if (rest.url && String(rest.url).startsWith('data:')) {
          const { url, ...meta } = rest;
          return meta;
        }
        return rest;
      });
    }
    // deliveryList / feedback are never sent: the card popup no longer edits
    // them, so the API keeps whatever it already has stored.
    const data = await api.updateProductionCard(token, cardId, body);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('nexora:notifications-changed'));
    }, 900);
    const prev = cardsRef.current.find((c) => c.id === cardId);
    const next = hydrateCard(data.card);
    if (prev) {
      next.fileList = mergeFileLists(prev.fileList || [], next.fileList || []);
      next.commentList = mergeCommentLists(prev.commentList || [], next.commentList || []);
    }
    return sync ? replaceCard(next) : next;
  }

  const loadUnreadCards = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.notificationsUnreadCards(token);
      setUnreadByCard(data.counts || {});
    } catch {
      setUnreadByCard({});
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    loadUnreadCards();
    const id = setInterval(loadUnreadCards, 20000);
    function onPing() { loadUnreadCards(); }
    window.addEventListener('nexora:notifications-changed', onPing);
    return () => {
      clearInterval(id);
      window.removeEventListener('nexora:notifications-changed', onPing);
    };
  }, [token, loadUnreadCards]);

  useEffect(() => {
    const raw = searchParams.get('card');
    if (!raw || loading) return;
    const cardId = Number(raw);
    if (!Number.isInteger(cardId) || cardId < 1) return;
    if (!cardsRef.current.some((c) => Number(c.id) === cardId)) return;
    handleSelect(cardId);
    const next = new URLSearchParams(searchParams);
    next.delete('card');
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams]);

  async function markCardAlertsRead(cardId) {
    if (!token || !cardId) return;
    try {
      await api.markCardNotificationsRead(token, cardId);
      setUnreadByCard((prev) => {
        if (!prev[String(cardId)]) return prev;
        const next = { ...prev };
        delete next[String(cardId)];
        return next;
      });
      window.dispatchEvent(new Event('nexora:notifications-changed'));
    } catch {
      // keep badge if mark-read fails
    }
  }

  /** Full card from API without wiping optimistic local state. */
  async function fetchFullCard(cardId) {
    const data = await api.getProductionCard(token, cardId);
    if (!data?.card) throw new Error('Card not found');
    return hydrateCard(data.card);
  }

  /**
   * The server copy is authoritative — it is the state that was just saved.
   * A local row the server does not know about survives only while it is still
   * `_pending` (queued, not sent yet); otherwise it was deleted server-side and
   * keeping it would resurrect deleted comments and revert edits.
   */
  function mergeById(localList = [], serverList = [], merge) {
    const serverById = new Map(serverList.map((item) => [String(item.id), item]));
    const kept = new Set();
    const merged = [];
    for (const local of localList) {
      const id = String(local.id);
      const server = serverById.get(id);
      if (server) {
        kept.add(id);
        merged.push(merge(local, server));
      } else if (local._pending) {
        merged.push(local);
      }
    }
    for (const server of serverList) {
      if (kept.has(String(server.id))) continue;
      merged.push(server);
    }
    return merged;
  }

  function mergeFileLists(localList = [], serverList = []) {
    return mergeById(localList, serverList, (local, server) => ({
      ...local,
      ...server,
      url: server.url || local.url || null,
      _pending: local._pending,
    }));
  }

  function matchesFilters(card) {
    const q = query.toLowerCase().trim();
    if (q && !`${card.title} ${card.client}`.toLowerCase().includes(q)) return false;
    if (filter === 'priority') return isHighPriority(card.priority) || card.priority === 'medium';
    if (filter === 'revision') return card.stage === 'draft_revisions' || card.type === 'revision';
    if (filter === 'overdue') return getDeadlineInfo(card.dueDate).tone === 'overdue';
    if (filter === 'live') return isLiveLikeStage(card.stage);
    if (filter === 'feedback') return card.feedback?.status && card.feedback.status !== 'none';
    return true;
  }

  /**
   * Manual board order (drag up/down). Unread badges stay on the card
   * but no longer jump it to the top — that fought reorder.
   */
  const cardsByStage = useMemo(() => {
    const grouped = new Map(productionStages.map((s) => [s.id, []]));
    for (const card of cards) {
      if (!grouped.has(card.stage) || !matchesFilters(card)) continue;
      grouped.get(card.stage).push(card);
    }
    for (const list of grouped.values()) {
      list.sort(sortByBoardOrder);
    }
    return grouped;
    // matchesFilters closes over query/filter, both listed below.
  }, [cards, query, filter]);

  function mergeCommentLists(localList = [], serverList = []) {
    return mergeById(localList, serverList, (local, server) => ({
      ...local,
      ...server,
      files: (server.files?.length ? server.files : local.files) || [],
      _pending: local._pending,
    }));
  }

  function handleSelect(id) {
    setSelectedId(id);
    setDrawerOpen(true);
    markCardAlertsRead(id);
    setHydratingId(id);
    // Hydrate full card in the background after the light list load. Merge with
    // any optimistic local edits so comments and attachments don't vanish.
    api.getProductionCard(token, id)
      .then((data) => {
        if (!data?.card) return;
        const server = hydrateCard(data.card);
        const local = cardsRef.current.find((c) => c.id === id);
        if (!local) {
          replaceCard(server);
          return;
        }
        replaceCard({
          ...server,
          commentList: mergeCommentLists(local.commentList || [], server.commentList || []),
          fileList: mergeFileLists(local.fileList || [], server.fileList || []),
        });
      })
      .catch(() => {})
      .finally(() => {
        setHydratingId((current) => (current === id ? null : current));
      });
  }

  function handleDragStart(e, card) {
    e.dataTransfer.setData('text/plain', String(card.id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(card.id);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function handleCardDragOver(stageId, index) {
    setDropTarget((prev) => {
      if (prev && prev.stageId === stageId && prev.index === index) return prev;
      return { stageId, index };
    });
  }

  function orderedIdsInStage(allCards, stageId) {
    return allCards
      .filter((c) => c.stage === stageId)
      .sort(sortByBoardOrder)
      .map((c) => c.id);
  }

  function isSameSpot(card, stageId, beforeId, allCards) {
    if (normalizeProductionStage(card.stage) !== normalizeProductionStage(stageId)) return false;
    const ids = orderedIdsInStage(allCards, stageId);
    const idx = ids.findIndex((id) => Number(id) === Number(card.id));
    if (idx < 0) return false;
    const currentBefore = ids[idx + 1] ?? null;
    if (beforeId == null) return currentBefore == null;
    return Number(currentBefore) === Number(beforeId);
  }

  function applyLocalReorder(cardId, stageId, beforeId) {
    commitCards((prev) => {
      const moving = prev.find((c) => c.id === cardId);
      if (!moving) return prev;
      const rest = prev.filter((c) => c.id !== cardId);
      const inTarget = rest.filter((c) => c.stage === stageId).sort(sortByBoardOrder);
      let at = inTarget.length;
      if (beforeId != null) {
        const idx = inTarget.findIndex((c) => Number(c.id) === Number(beforeId));
        if (idx >= 0) at = idx;
      }
      inTarget.splice(at, 0, { ...moving, stage: stageId });
      const orderMap = new Map(inTarget.map((c, i) => [String(c.id), i * 10]));
      return prev.map((c) => {
        const order = orderMap.get(String(c.id));
        if (order == null && Number(c.id) !== Number(cardId)) return c;
        return hydrateCard({
          ...c,
          stage: Number(c.id) === Number(cardId) ? stageId : c.stage,
          sortOrder: order ?? c.sortOrder,
        });
      });
    });
  }

  async function moveCard(cardId, stageId, beforeId = null) {
    const snapshot = cardsRef.current;
    const card = snapshot.find((item) => item.id === cardId);
    const targetStage = normalizeProductionStage(stageId);
    if (!card) return;

    if (requiresLiveLink(targetStage) && !hasLiveLink(card)) {
      showToast('Add the live link on the card first, then move to this stage');
      handleSelect(cardId);
      return;
    }

    if (isSameSpot(card, targetStage, beforeId, snapshot)) return;

    const stageChanged = normalizeProductionStage(card.stage) !== targetStage;
    const fromTitle = productionStages.find((stage) => stage.id === card.stage)?.title;
    const toTitle = productionStages.find((stage) => stage.id === targetStage)?.title;
    applyLocalReorder(cardId, targetStage, beforeId);
    try {
      await api.moveProductionCard(token, cardId, { stage: targetStage, beforeId });
      if (stageChanged) {
        pushActivity(cardId, `moved this card from ${fromTitle} to ${toTitle}`);
        showToast(`Moved "${card.client || card.title}" → ${toTitle}`);
      }
    } catch (err) {
      commitCards(snapshot);
      showToast(err.message || 'Could not move card');
    }
  }

  function handleDrop(stageId) {
    if (draggingId == null) return;
    const visible = cardsByStage.get(stageId) || [];
    const index = dropTarget?.stageId === stageId ? dropTarget.index : visible.length;
    let beforeId = null;
    if (index != null && index < visible.length) {
      beforeId = visible[index].id;
      if (Number(beforeId) === Number(draggingId)) {
        beforeId = visible[index + 1]?.id ?? null;
      }
    }
    moveCard(draggingId, stageId, beforeId);
    setDraggingId(null);
    setDropTarget(null);
  }

  function handleAddCard(stageId) {
    if (!canCreateCards) {
      showToast('Only admin can create production cards');
      return;
    }
    setModalStage(stageId || productionStages[0].id);
    setModalOpen(true);
  }

  async function handleCreateCard(form) {
    const rawFiles = Array.from(form.files || []);
    let fileList = [];
    if (rawFiles.length) {
      try {
        fileList = await uploadFilesToHost(token, rawFiles);
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
        deliveryList: [],
        commentList: fileList.length
          ? [{
              id: localId('comment'),
              kind: 'comment',
              author: user?.name || 'You',
              authorId: user?.id ?? null,
              avatar: '/assets/avatar-jane.svg',
              text: fileList.length === 1
                ? `Attached ${fileList[0].name}`
                : `Attached ${fileList.length} files`,
              files: fileList,
              time: 'now',
              createdAt: new Date().toISOString(),
            }]
          : [],
      });
      const card = hydrateCard(data.card);
      commitCards((prev) => [...prev, card]);
      setSelectedId(card.id);
      setDrawerOpen(true);
      setModalOpen(false);
      pushActivity(card.id, 'created this card');
      showToast(
        fileList.length
          ? `Card created with ${fileList.length} file${fileList.length > 1 ? 's' : ''}`
          : 'New production card created',
      );
      window.setTimeout(() => {
        window.dispatchEvent(new Event('nexora:notifications-changed'));
      }, 900);
    } catch (err) {
      showToast(err.message || 'Could not create card');
      throw err;
    }
  }

  async function handleUpdateCard(cardId, patch) {
    const prevCard = cardsRef.current.find((c) => c.id === cardId);
    const prevComments = prevCard?.commentList || [];
    const commentsOnly = Object.keys(patch).length === 1 && 'commentList' in patch;
    // Apply the edit / delete locally first: the save response is merged over
    // local state, so leaving the old copy in place brings it straight back.
    if (commentsOnly) patchCardLocal(cardId, { commentList: patch.commentList || [] });
    try {
      await persistCard(cardId, patch);
      if (commentsOnly) {
        if ((patch.commentList || []).length < prevComments.length) {
          pruneCommentAddActivities(cardId);
          showToast('Comment deleted');
        } else {
          showToast('Comment saved');
        }
        return true;
      }
      pushActivity(cardId, 'updated card details');
      showToast('Card updated');
      return true;
    } catch (err) {
      if (commentsOnly && prevCard) patchCardLocal(cardId, { commentList: prevComments });
      showToast(err.message || 'Could not update card');
      return false;
    }
  }

  async function handleDeleteCard(cardId) {
    const card = cards.find((c) => c.id === cardId);
    try {
      await api.deleteProductionCard(token, cardId);
      commitCards((prev) => prev.filter((c) => c.id !== cardId));
      setSelectedId(null);
      setDrawerOpen(false);
      showToast(card ? `Deleted "${card.title}"` : 'Card deleted');
      return true;
    } catch (err) {
      showToast(err.message || 'Could not delete card');
      return false;
    }
  }

  async function handleAddComment(text, files = []) {
    const card = selectedCard || cardsRef.current.find((c) => c.id === selectedId);
    if (!card) return false;
    const cardId = card.id;
    const picked = Array.from(files || []);
    const blobEntries = picked.map((file) => ({
      id: localId('file'),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
      _pending: true,
    }));

    const entry = {
      id: localId('comment'),
      kind: 'comment',
      author: user?.name || 'You',
      authorId: user?.id ?? null,
      avatar: '/assets/avatar-jane.svg',
      text: String(text || '').trim(),
      files: blobEntries,
      time: 'now',
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    const commentList = [entry, ...(card.commentList || [])];
    patchCardLocal(cardId, { commentList });
    showToast('Comment added');

    enqueueCardSave(cardId, async () => {
      try {
        const hosted = picked.length ? await uploadFilesToHost(token, picked) : [];
        revokeBlobUrls(blobEntries);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const nextComments = (latest?.commentList || commentList).map((c) => (
          String(c.id) === String(entry.id)
            ? { ...c, files: hosted, _pending: false }
            : c
        ));
        patchCardLocal(cardId, { commentList: nextComments });
        await persistCard(cardId, { commentList: nextComments }, { sync: false });
        patchCardLocal(cardId, {
          commentList: (cardsRef.current.find((c) => c.id === cardId)?.commentList || nextComments)
            .map((c) => (String(c.id) === String(entry.id) ? { ...c, _pending: false } : c)),
        });
        showToast('Comment saved');
      } catch (err) {
        revokeBlobUrls(blobEntries);
        patchCardLocal(cardId, {
          commentList: (cardsRef.current.find((c) => c.id === cardId)?.commentList || commentList)
            .filter((c) => String(c.id) !== String(entry.id)),
        });
        showToast(err.message || 'Could not save comment');
      }
    });
    return true;
  }

  async function handleUploadFiles(cardId, files) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return false;
    const existing = card.fileList || [];
    const existingBytes = existing.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const { ok, errors } = validateFiles(files, existing.length, existingBytes);
    if (!ok.length) {
      showToast(errors[0] || 'Upload blocked');
      return false;
    }
    if (errors.length) showToast(errors[0]);

    const placeholders = ok.map((file) => ({
      id: localId('file'),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
      _pending: true,
    }));
    const placeholderIds = new Set(placeholders.map((f) => String(f.id)));
    const optimisticList = [...placeholders, ...existing].slice(0, MAX_FILES_PER_CARD);
    const attachComment = {
      id: localId('comment'),
      kind: 'comment',
      author: user?.name || 'You',
      authorId: user?.id ?? null,
      avatar: '/assets/avatar-jane.svg',
      text: placeholders.length === 1
        ? `Attached ${placeholders[0].name}`
        : `Attached ${placeholders.length} files`,
      files: placeholders,
      time: 'now',
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    const nextComments = [attachComment, ...(card.commentList || [])];
    patchCardLocal(cardId, { fileList: optimisticList, commentList: nextComments });
    showToast(placeholders.length === 1 ? 'Uploading file…' : `Uploading ${placeholders.length} files…`);

    enqueueCardSave(cardId, async () => {
      try {
        const hosted = await uploadFilesToHost(token, ok);
        revokeBlobUrls(placeholders);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const withoutPlaceholders = (latest?.fileList || optimisticList)
          .filter((f) => !placeholderIds.has(String(f.id)));
        const merged = [...hosted, ...withoutPlaceholders].slice(0, MAX_FILES_PER_CARD);
        const comments = (latest?.commentList || nextComments).map((c) => (
          String(c.id) === String(attachComment.id)
            ? { ...c, files: hosted, _pending: false }
            : c
        ));
        patchCardLocal(cardId, { fileList: merged, commentList: comments });
        await persistCard(cardId, { fileList: merged, commentList: comments }, { sync: false });
        patchCardLocal(cardId, {
          fileList: merged.map((f) => ({ ...f, _pending: false })),
          commentList: comments.map((c) => (
            String(c.id) === String(attachComment.id) ? { ...c, _pending: false } : c
          )),
        });
        showToast(`${hosted.length} file${hosted.length > 1 ? 's' : ''} uploaded`);
      } catch (err) {
        revokeBlobUrls(placeholders);
        patchCardLocal(cardId, {
          fileList: (cardsRef.current.find((c) => c.id === cardId)?.fileList || [])
            .filter((f) => !placeholderIds.has(String(f.id))),
          commentList: (cardsRef.current.find((c) => c.id === cardId)?.commentList || [])
            .filter((c) => String(c.id) !== String(attachComment.id)),
        });
        showToast(err.message || 'Upload failed');
      }
    });
    return true;
  }

  function handleRemoveFile(cardId, fileId) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return;
    const removed = (card.fileList || []).find((f) => f.id === fileId);
    const previous = card.fileList || [];
    const fileList = previous.filter((f) => f.id !== fileId);
    patchCardLocal(cardId, { fileList });
    if (removed) pushActivity(cardId, `removed ${removed.name}`);
    showToast('Attachment removed');

    enqueueCardSave(cardId, async () => {
      try {
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = (latest?.fileList || fileList)
          .filter((f) => String(f.id) !== String(fileId));
        await persistCard(cardId, { fileList: merged }, { sync: false });
        patchCardLocal(cardId, { fileList: merged.map((f) => ({ ...f, _pending: false })) });
      } catch (err) {
        patchCardLocal(cardId, { fileList: previous });
        showToast(err.message || 'Could not remove file');
      }
    });
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
          <button
            type="button"
            className={`tool-btn${filterOpen ? ' is-active' : ''}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
          >
            <Icon id="i-filter" /><span>Filter</span>
          </button>
          {canCreateCards ? (
            <button type="button" className="primary-btn" onClick={() => handleAddCard(productionStages[0].id)}>
              New Card <Icon id="i-plus" />
            </button>
          ) : null}
        </div>
      </div>

      {filterOpen ? (
        <div className="filter-strip">
          {filters.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="board-loading">
          <div className="app-boot-spinner" aria-hidden="true" />
          Loading board…
        </div>
      ) : (
      <div className="kanban kanban-pipeline">
        {productionStages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            cards={cardsByStage.get(stage.id) || []}
            selectedId={selectedId}
            draggingId={draggingId}
            dropIndex={dropTarget?.stageId === stage.id ? dropTarget.index : null}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onCardDragOver={handleCardDragOver}
            onAddCard={canCreateCards ? handleAddCard : null}
            unreadByCard={unreadByCard}
            mobileActive
          />
        ))}
      </div>
      )}

      <CardDrawer
        card={selectedCard}
        stage={selectedStage}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activity={activity}
        comments={comments}
        onAddComment={handleAddComment}
        currentUser={user}
        onUpdateCard={handleUpdateCard}
        onDeleteCard={canDeleteCards ? handleDeleteCard : null}
        canEditMeta={canEditCardMeta}
        onUploadFiles={handleUploadFiles}
        onRemoveFile={handleRemoveFile}
        stages={productionStages}
        assignees={assignees}
        crmClients={crmClients}
        onMove={(stageId) => selectedCard && moveCard(selectedCard.id, stageId)}
        hydrating={hydratingId != null && hydratingId === selectedId}
      />
      <div
        className={`scrim${drawerOpen ? ' visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />

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
