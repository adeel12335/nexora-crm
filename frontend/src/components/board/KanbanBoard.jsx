import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../icons/IconSprite.jsx';
import KanbanColumn from './KanbanColumn.jsx';
import CardDrawer from './CardDrawer.jsx';
import NewCardModal from './NewCardModal.jsx';
import { avatarPool, productionStages } from '../../data/mockData.js';
import { requiresLiveLink, isLiveLikeStage, normalizeProductionStage } from '../../data/productionStages.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import { isHighPriority, validateFiles, MAX_FILES_PER_CARD, MAX_DELIVERIES_PER_CARD } from '../../utils/boardValidation.js';
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
  };
}

/** Upload File objects to Hostinger; returns card attachment metadata (http URLs). */
async function uploadFilesToHost(token, files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return [];
  const data = await api.uploadProductionFiles(token, list);
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type || 'application/octet-stream',
    url: f.url,
    uploadedAt: f.uploadedAt || new Date().toISOString(),
  }));
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
    setCards((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    return next;
  }

  function patchCardLocal(cardId, patch) {
    let nextCard = null;
    setCards((prev) => prev.map((item) => {
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
    if ('deliveryList' in patch) {
      body.deliveryList = (patch.deliveryList || []).map(({ _pending, ...rest }) => {
        if (_pending) return rest;
        const stripFile = (f) => {
          if (!f) return f;
          if (f.fileUrl && String(f.fileUrl).startsWith('data:')) {
            const { fileUrl, ...meta } = f;
            return meta;
          }
          if (f.url && String(f.url).startsWith('data:')) {
            const { url, ...meta } = f;
            return meta;
          }
          return f;
        };
        return {
          ...rest,
          fileUrl: rest.fileUrl && String(rest.fileUrl).startsWith('data:') ? undefined : rest.fileUrl,
          files: Array.isArray(rest.files) ? rest.files.map(stripFile) : rest.files,
        };
      });
    }
    if ('feedback' in patch) body.feedback = patch.feedback;
    const data = await api.updateProductionCard(token, cardId, body);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('nexora:notifications-changed'));
    }, 900);
    if (!sync) {
      const prev = cardsRef.current.find((c) => c.id === cardId);
      const next = hydrateCard(data.card);
      if (prev) {
        next.fileList = mergeFileLists(prev.fileList || [], next.fileList || []);
        next.commentList = mergeCommentLists(prev.commentList || [], next.commentList || []);
        next.deliveryList = mergeDeliveryLists(prev.deliveryList || [], next.deliveryList || []);
      }
      return next;
    }
    const prev = cardsRef.current.find((c) => c.id === cardId);
    const next = hydrateCard(data.card);
    if (prev) {
      next.fileList = mergeFileLists(prev.fileList || [], next.fileList || []);
      next.commentList = mergeCommentLists(prev.commentList || [], next.commentList || []);
      next.deliveryList = mergeDeliveryLists(prev.deliveryList || [], next.deliveryList || []);
    }
    return replaceCard(next);
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

  /** Prefer local file/data URLs, fill missing ones from server copy. */
  function mergeDeliveryLists(localList = [], serverList = []) {
    const serverById = new Map(serverList.map((d) => [String(d.id), d]));
    const seen = new Set();
    const merged = [];
    for (const local of localList) {
      const id = String(local.id);
      seen.add(id);
      const server = serverById.get(id);
      if (!server) {
        merged.push(local);
        continue;
      }
      const localFiles = Array.isArray(local.files) && local.files.length
        ? local.files
        : (local.fileUrl || local.name
          ? [{ id: local.id, name: local.name, size: local.size, type: local.type, fileUrl: local.fileUrl }]
          : []);
      const serverFiles = Array.isArray(server.files) && server.files.length
        ? server.files
        : (server.fileUrl || server.name
          ? [{ id: server.id, name: server.name, size: server.size, type: server.type, fileUrl: server.fileUrl }]
          : []);
      const serverFileById = new Map(serverFiles.map((f) => [String(f.id || f.name), f]));
      const files = localFiles.map((f) => {
        const key = String(f.id || f.name);
        const sf = serverFileById.get(key);
        return {
          ...sf,
          ...f,
          fileUrl: f.fileUrl || sf?.fileUrl || null,
        };
      });
      for (const sf of serverFiles) {
        const key = String(sf.id || sf.name);
        if (files.some((f) => String(f.id || f.name) === key)) continue;
        files.push(sf);
      }
      const primary = files[0] || null;
      merged.push({
        ...server,
        ...local,
        files,
        name: primary?.name || local.name || server.name || null,
        size: primary?.size ?? local.size ?? server.size ?? null,
        type: primary?.type || local.type || server.type || null,
        fileUrl: primary?.fileUrl || local.fileUrl || server.fileUrl || null,
        url: local.url || server.url || null,
        feedback: local.feedback || server.feedback,
      });
    }
    for (const server of serverList) {
      const id = String(server.id);
      if (seen.has(id)) continue;
      merged.push(server);
    }
    return merged;
  }

  function mergeFileLists(localList = [], serverList = []) {
    const serverById = new Map(serverList.map((f) => [String(f.id), f]));
    const seen = new Set();
    const merged = [];
    for (const local of localList) {
      const id = String(local.id);
      seen.add(id);
      const server = serverById.get(id);
      if (!server) {
        merged.push(local);
        continue;
      }
      merged.push({
        ...server,
        ...local,
        url: local.url || server.url || null,
      });
    }
    for (const server of serverList) {
      const id = String(server.id);
      if (seen.has(id)) continue;
      merged.push(server);
    }
    return merged;
  }

  function visibleCards(stageId) {
    const q = query.toLowerCase().trim();
    return cards.filter((card) => {
      if (card.stage !== stageId) return false;
      if (q && !`${card.title} ${card.client}`.toLowerCase().includes(q)) return false;
      if (filter === 'priority') return isHighPriority(card.priority) || card.priority === 'medium';
      if (filter === 'revision') return card.stage === 'draft_revisions' || card.type === 'revision';
      if (filter === 'overdue') return getDeadlineInfo(card.dueDate).tone === 'overdue';
      if (filter === 'live') return isLiveLikeStage(card.stage);
      if (filter === 'feedback') return card.feedback?.status && card.feedback.status !== 'none';
      return true;
    });
  }

  function mergeCommentLists(localList = [], serverList = []) {
    const serverById = new Map(serverList.map((c) => [String(c.id), c]));
    const seen = new Set();
    const merged = [];
    for (const local of localList) {
      const id = String(local.id);
      seen.add(id);
      merged.push(serverById.get(id) ? { ...serverById.get(id), ...local } : local);
    }
    for (const server of serverList) {
      const id = String(server.id);
      if (seen.has(id)) continue;
      merged.push(server);
    }
    return merged;
  }

  function handleSelect(id) {
    setSelectedId(id);
    setDrawerOpen(true);
    markCardAlertsRead(id);
    setHydratingId(id);
    // Hydrate full card (file data URLs) in background after light list load.
    // Merge with any optimistic local edits so comments/deliveries don't vanish.
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
          deliveryList: mergeDeliveryLists(local.deliveryList || [], server.deliveryList || []),
          fileList: mergeFileLists(local.fileList || [], server.fileList || []),
          feedback: local.feedback?.updatedAt && (
            !server.feedback?.updatedAt
            || String(local.feedback.updatedAt) > String(server.feedback.updatedAt)
          )
            ? local.feedback
            : (server.feedback || local.feedback),
        });
      })
      .catch(() => {})
      .finally(() => {
        setHydratingId((current) => (current === id ? null : current));
      });
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
    const targetStage = normalizeProductionStage(stageId);
    if (!card || card.stage === targetStage) return;

    if (requiresLiveLink(targetStage) && !hasLiveLink(card)) {
      showToast('Add the live link on the card first, then move to this stage');
      handleSelect(cardId);
      return;
    }

    const fromTitle = productionStages.find((stage) => stage.id === card.stage)?.title;
    const toTitle = productionStages.find((stage) => stage.id === targetStage)?.title;
    try {
      await persistCard(cardId, { stage: targetStage });
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
              id: Date.now() + Math.random(),
              kind: 'comment',
              author: user?.name || 'You',
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
      setCards((prev) => [...prev, card]);
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
    try {
      const prevCard = cardsRef.current.find((c) => c.id === cardId);
      const prevComments = prevCard?.commentList || [];
      await persistCard(cardId, patch);
      if (Object.keys(patch).length === 1 && 'commentList' in patch) {
        const nextComments = patch.commentList || [];
        if (nextComments.length < prevComments.length) {
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

  async function handleAddComment(text, files = []) {
    const card = selectedCard || cardsRef.current.find((c) => c.id === selectedId);
    if (!card) return false;
    const cardId = card.id;
    const picked = Array.from(files || []);

    let fileEntries = [];
    try {
      fileEntries = await uploadFilesToHost(token, picked);
    } catch (err) {
      showToast(err.message || 'Could not attach files');
      return false;
    }

    const entry = {
      id: nextFileId++,
      kind: 'comment',
      author: user?.name || 'You',
      avatar: '/assets/avatar-jane.svg',
      text: String(text || '').trim(),
      files: fileEntries,
      time: 'now',
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    const commentList = [entry, ...(card.commentList || [])];
    patchCardLocal(cardId, { commentList });
    showToast('Comment added');

    enqueueCardSave(cardId, async () => {
      try {
        const latest = cardsRef.current.find((c) => c.id === cardId);
        await persistCard(cardId, { commentList: latest?.commentList || commentList }, { sync: false });
        patchCardLocal(cardId, {
          commentList: (cardsRef.current.find((c) => c.id === cardId)?.commentList || [])
            .map((c) => (String(c.id) === String(entry.id) ? { ...c, _pending: false } : c)),
        });
        showToast('Comment saved');
      } catch (err) {
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

    try {
      const hosted = await uploadFilesToHost(token, ok);
      const uploaded = hosted.map((f) => ({ ...f, _pending: true }));
      const optimisticList = [...uploaded, ...existing].slice(0, MAX_FILES_PER_CARD);
      const attachComment = {
        id: Date.now() + Math.random(),
        kind: 'comment',
        author: user?.name || 'You',
        avatar: '/assets/avatar-jane.svg',
        text: uploaded.length === 1
          ? `Attached ${uploaded[0].name}`
          : `Attached ${uploaded.length} files`,
        files: uploaded.map(({ _pending, ...rest }) => rest),
        time: 'now',
        createdAt: new Date().toISOString(),
        _pending: true,
      };
      const nextComments = [attachComment, ...(card.commentList || [])];
      patchCardLocal(cardId, { fileList: optimisticList, commentList: nextComments });
      showToast(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);

      enqueueCardSave(cardId, async () => {
        try {
          const latest = cardsRef.current.find((c) => c.id === cardId);
          const merged = (latest?.fileList || optimisticList).slice(0, MAX_FILES_PER_CARD);
          const comments = latest?.commentList || nextComments;
          await persistCard(cardId, { fileList: merged, commentList: comments }, { sync: false });
          patchCardLocal(cardId, {
            fileList: merged.map((f) => ({ ...f, _pending: false })),
            commentList: comments.map((c) => (
              String(c.id) === String(attachComment.id) ? { ...c, _pending: false } : c
            )),
          });
        } catch (err) {
          const uploadedIds = new Set(uploaded.map((f) => String(f.id)));
          patchCardLocal(cardId, {
            fileList: (cardsRef.current.find((c) => c.id === cardId)?.fileList || [])
              .filter((f) => !uploadedIds.has(String(f.id))),
            commentList: (cardsRef.current.find((c) => c.id === cardId)?.commentList || [])
              .filter((c) => String(c.id) !== String(attachComment.id)),
          });
          showToast(err.message || 'Upload failed');
        }
      });
      return true;
    } catch (err) {
      showToast(err.message || 'Upload failed');
      return false;
    }
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

  async function handleAddDelivery(cardId, { description, url, file, files }) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return false;
    const existing = card.deliveryList || [];
    if (existing.length >= MAX_DELIVERIES_PER_CARD) {
      showToast(`A card can have at most ${MAX_DELIVERIES_PER_CARD} deliveries`);
      return false;
    }

    const picked = Array.isArray(files) && files.length
      ? files
      : (file ? [file] : []);

    let fileEntries = [];
    try {
      const hosted = await uploadFilesToHost(token, picked);
      fileEntries = hosted.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        fileUrl: f.url,
      }));
    } catch (err) {
      showToast(err.message || 'Could not upload file');
      return false;
    }

    const primary = fileEntries[0] || null;
    const entry = {
      id: nextFileId++,
      description,
      url: url || null,
      name: primary?.name || null,
      size: primary?.size ?? null,
      type: primary?.type || null,
      fileUrl: primary?.fileUrl || null,
      files: fileEntries,
      createdAt: new Date().toISOString(),
      createdBy: user
        ? { id: user.id, name: user.name, role: user.role }
        : null,
      feedback: { status: 'none', note: '', updatedAt: null, author: null },
      _pending: true,
    };

    const deliveryList = [entry, ...existing].slice(0, MAX_DELIVERIES_PER_CARD);
    patchCardLocal(cardId, { deliveryList });
    pushActivity(cardId, fileEntries.length > 1 ? `added a delivery (${fileEntries.length} files)` : 'added a delivery');
    showToast(fileEntries.length > 1 ? `Delivery added (${fileEntries.length} files)` : 'Delivery added');

    enqueueCardSave(cardId, async () => {
      try {
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = (latest?.deliveryList || deliveryList).slice(0, MAX_DELIVERIES_PER_CARD);
        await persistCard(cardId, { deliveryList: merged }, { sync: false });
        patchCardLocal(cardId, {
          deliveryList: merged.map((d) => ({ ...d, _pending: false })),
        });
        showToast('Delivery saved');
      } catch (err) {
        patchCardLocal(cardId, {
          deliveryList: (cardsRef.current.find((c) => c.id === cardId)?.deliveryList || [])
            .filter((d) => String(d.id) !== String(entry.id)),
        });
        showToast(err.message || 'Could not save delivery');
      }
    });

    return true;
  }

  function handleSaveDeliveryFeedback(cardId, deliveryId, feedback) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return false;
    const previous = card.deliveryList || [];
    const deliveryList = previous.map((item) => (
      Number(item.id) === Number(deliveryId) || String(item.id) === String(deliveryId)
        ? {
            ...item,
            feedback: {
              status: feedback.status,
              note: feedback.note || '',
              updatedAt: feedback.updatedAt || new Date().toISOString(),
              author: feedback.author || user?.name || 'Admin',
            },
          }
        : item
    ));
    patchCardLocal(cardId, { deliveryList });
    pushActivity(cardId, `reviewed a delivery (${feedback.status.replaceAll('_', ' ')})`);
    showToast('Delivery feedback saved');

    enqueueCardSave(cardId, async () => {
      try {
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = latest?.deliveryList || deliveryList;
        await persistCard(cardId, { deliveryList: merged }, { sync: false });
        patchCardLocal(cardId, { deliveryList: merged });
      } catch (err) {
        patchCardLocal(cardId, { deliveryList: previous });
        showToast(err.message || 'Could not save delivery feedback');
      }
    });
    return true;
  }

  function handleRemoveDelivery(cardId, deliveryId) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return;
    const previous = card.deliveryList || [];
    const removed = previous.find((d) => d.id === deliveryId);
    const deliveryList = previous.filter((d) => d.id !== deliveryId);
    patchCardLocal(cardId, { deliveryList });
    if (removed) pushActivity(cardId, 'removed a delivery');
    showToast('Delivery removed');

    enqueueCardSave(cardId, async () => {
      try {
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = (latest?.deliveryList || deliveryList)
          .filter((d) => String(d.id) !== String(deliveryId));
        await persistCard(cardId, { deliveryList: merged }, { sync: false });
        patchCardLocal(cardId, { deliveryList: merged });
      } catch (err) {
        patchCardLocal(cardId, { deliveryList: previous });
        showToast(err.message || 'Could not remove delivery');
      }
    });
  }

  async function handleSaveFeedback(cardId, feedback) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    const previous = card?.feedback;
    patchCardLocal(cardId, { feedback });
    pushActivity(cardId, `set feedback to "${feedback.status.replaceAll('_', ' ')}"`);
    showToast('Feedback saved');
    try {
      await persistCard(cardId, { feedback }, { sync: false });
      return true;
    } catch (err) {
      if (previous) patchCardLocal(cardId, { feedback: previous });
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
            cards={visibleCards(stage.id)}
            selectedId={selectedId}
            draggingId={draggingId}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
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
        onUpdateCard={handleUpdateCard}
        onDeleteCard={canDeleteCards ? handleDeleteCard : null}
        canEditMeta={canEditCardMeta}
        onUploadFiles={handleUploadFiles}
        onRemoveFile={handleRemoveFile}
        onAddDelivery={handleAddDelivery}
        onSaveDeliveryFeedback={handleSaveDeliveryFeedback}
        onRemoveDelivery={handleRemoveDelivery}
        canReviewDelivery={isAdmin}
        onSaveFeedback={handleSaveFeedback}
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
