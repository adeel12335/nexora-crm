import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [modalStage, setModalStage] = useState(productionStages[0].id);
  const [activityByCard, setActivityByCard] = useState({});
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
    if ('commentList' in patch) {
      body.commentList = (patch.commentList || []).map(({ _pending, ...rest }) => rest);
    }
    if ('fileList' in patch) {
      body.fileList = (patch.fileList || []).map(({ _pending, ...rest }) => rest);
    }
    if ('deliveryList' in patch) {
      body.deliveryList = (patch.deliveryList || []).map(({ _pending, ...rest }) => rest);
    }
    if ('feedback' in patch) body.feedback = patch.feedback;
    const data = await api.updateProductionCard(token, cardId, body);
    if (!sync) return hydrateCard(data.card);
    return replaceCard(data.card);
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
      merged.push({
        ...server,
        ...local,
        fileUrl: local.fileUrl || server.fileUrl || null,
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
        deliveryList: [],
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

  function handleAddComment(text) {
    const card = selectedCard || cardsRef.current.find((c) => c.id === selectedId);
    if (!card) return;
    const cardId = card.id;
    const entry = {
      id: nextFileId++,
      kind: 'comment',
      author: user?.name || 'You',
      avatar: '/assets/avatar-jane.svg',
      text,
      time: 'now',
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    const commentList = [entry, ...(card.commentList || [])];
    patchCardLocal(cardId, { commentList });
    pushActivity(cardId, 'added a comment');
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
  }

  function handleUploadFiles(cardId, files) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return;
    const existing = card.fileList || [];
    const existingBytes = existing.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const { ok, errors } = validateFiles(files, existing.length, existingBytes);
    if (!ok.length) {
      showToast(errors[0] || 'Upload blocked');
      return;
    }
    if (errors.length) showToast(errors[0]);

    (async () => {
      try {
        const uploaded = await Promise.all(ok.map(async (file) => ({
          id: nextFileId++,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          url: await readFileAsDataUrl(file),
          uploadedAt: new Date().toISOString(),
        })));
        const optimisticList = [...uploaded, ...existing].slice(0, MAX_FILES_PER_CARD);
        patchCardLocal(cardId, { fileList: optimisticList });
        pushActivity(cardId, `uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`);
        showToast(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);

        enqueueCardSave(cardId, async () => {
          try {
            const serverCard = await fetchFullCard(cardId);
            const latest = cardsRef.current.find((c) => c.id === cardId);
            const merged = mergeFileLists(latest?.fileList || optimisticList, serverCard.fileList || [])
              .slice(0, MAX_FILES_PER_CARD);
            await persistCard(cardId, { fileList: merged }, { sync: false });
            patchCardLocal(cardId, { fileList: merged });
          } catch (err) {
            const uploadedIds = new Set(uploaded.map((f) => String(f.id)));
            patchCardLocal(cardId, {
              fileList: (cardsRef.current.find((c) => c.id === cardId)?.fileList || [])
                .filter((f) => !uploadedIds.has(String(f.id))),
            });
            showToast(err.message || 'Upload failed');
          }
        });
      } catch (err) {
        showToast(err.message || 'Upload failed');
      }
    })();
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
        const serverCard = await fetchFullCard(cardId);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = mergeFileLists(latest?.fileList || fileList, serverCard.fileList || [])
          .filter((f) => String(f.id) !== String(fileId));
        await persistCard(cardId, { fileList: merged }, { sync: false });
        patchCardLocal(cardId, { fileList: merged });
      } catch (err) {
        patchCardLocal(cardId, { fileList: previous });
        showToast(err.message || 'Could not remove file');
      }
    });
  }

  async function handleAddDelivery(cardId, { description, url, file }) {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return false;
    const existing = card.deliveryList || [];
    if (existing.length >= MAX_DELIVERIES_PER_CARD) {
      showToast(`A card can have at most ${MAX_DELIVERIES_PER_CARD} deliveries`);
      return false;
    }

    let fileFields = {
      name: null,
      size: null,
      type: null,
      fileUrl: null,
    };
    try {
      if (file) {
        fileFields = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          fileUrl: await readFileAsDataUrl(file),
        };
      }
    } catch (err) {
      showToast(err.message || 'Could not read file');
      return false;
    }

    const entry = {
      id: nextFileId++,
      description,
      url: url || null,
      ...fileFields,
      createdAt: new Date().toISOString(),
      createdBy: user
        ? { id: user.id, name: user.name, role: user.role }
        : null,
      feedback: { status: 'none', note: '', updatedAt: null, author: null },
      _pending: true,
    };

    const deliveryList = [entry, ...existing].slice(0, MAX_DELIVERIES_PER_CARD);
    patchCardLocal(cardId, { deliveryList });
    pushActivity(cardId, 'added a delivery');
    showToast('Delivery added');

    enqueueCardSave(cardId, async () => {
      try {
        const serverCard = await fetchFullCard(cardId);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = mergeDeliveryLists(
          latest?.deliveryList || deliveryList,
          serverCard.deliveryList || [],
        ).slice(0, MAX_DELIVERIES_PER_CARD)
          .map((d) => (String(d.id) === String(entry.id) ? { ...d, _pending: false } : { ...d, _pending: false }));
        await persistCard(cardId, { deliveryList: merged }, { sync: false });
        patchCardLocal(cardId, { deliveryList: merged });
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
        const serverCard = await fetchFullCard(cardId);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = mergeDeliveryLists(
          latest?.deliveryList || deliveryList,
          serverCard.deliveryList || [],
        );
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
        const serverCard = await fetchFullCard(cardId);
        const latest = cardsRef.current.find((c) => c.id === cardId);
        const merged = mergeDeliveryLists(
          latest?.deliveryList || deliveryList,
          serverCard.deliveryList || [],
        ).filter((d) => String(d.id) !== String(deliveryId));
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

      {loading ? <p className="commission-note">Loading board…</p> : null}

      {filterOpen ? (
        <div className="filter-strip">
          {filters.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

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
            mobileActive
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
        onAddDelivery={handleAddDelivery}
        onSaveDeliveryFeedback={handleSaveDeliveryFeedback}
        onRemoveDelivery={handleRemoveDelivery}
        canReviewDelivery={isAdmin}
        onSaveFeedback={handleSaveFeedback}
        stages={productionStages}
        assignees={assignees}
        crmClients={crmClients}
        onMove={(stageId) => selectedCard && moveCard(selectedCard.id, stageId)}
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
