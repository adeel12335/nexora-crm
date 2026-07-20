const stages = [
  { id: 'new', title: 'New Leads', color: '#a747ff' },
  { id: 'contacted', title: 'Contacted', color: '#2d7cff' },
  { id: 'proposal', title: 'Proposal Sent', color: '#ff9f1f' },
  { id: 'negotiation', title: 'Negotiation', color: '#ff5a68' },
  { id: 'won', title: 'Won', color: '#14b86c' },
];

let cards = [
  { id: 1, stage: 'new', title: 'Website Redesign Inquiry', company: 'Acme Corp', due: 'May 28', assignee: 'jane', priority: true, description: 'New inbound request for a premium multi-market website redesign.' },
  { id: 2, stage: 'new', title: 'Product Demo Request', company: 'Globex Inc', due: 'May 27', assignee: 'robert', description: 'Product demonstration requested by the operations and sales teams.' },
  { id: 3, stage: 'new', title: 'Social Media Campaign', company: 'Soylent Corp', due: 'May 26', assignee: 'lina', description: 'Lead interested in a coordinated product launch and social campaign.' },
  { id: 4, stage: 'contacted', title: 'Follow up - Email', company: 'Initech', due: 'May 26', assignee: 'omar', description: 'Follow up after discovery call and share the implementation roadmap.' },
  { id: 5, stage: 'contacted', title: 'Pricing Discussion', company: 'Umbrella Corp', due: 'May 25', assignee: 'maya', comments: 2, description: 'Discuss annual pricing, migration scope and support coverage.' },
  { id: 6, stage: 'contacted', title: 'Intro Call Scheduled', company: 'Hooli', due: 'May 24', assignee: 'jane', description: 'Introductory call scheduled with product and finance stakeholders.' },
  { id: 7, stage: 'proposal', title: 'CRM Proposal', company: 'Stark Industries', due: 'May 24', assignee: 'robert', attachments: 2, priority: true, selected: true, description: 'Proposal for enterprise CRM implementation with custom integrations and 12 months support.' },
  { id: 8, stage: 'proposal', title: 'Custom Plan', company: 'Wayne Enterprises', due: 'May 23', assignee: 'lina', description: 'Custom plan combining CRM, analytics and multi-team permissions.' },
  { id: 9, stage: 'proposal', title: 'Annual Subscription', company: 'Oscorp', due: 'May 22', assignee: 'omar', description: 'Annual subscription proposal prepared for executive review.' },
  { id: 10, stage: 'negotiation', title: 'Discount Discussion', company: 'Cyberdyne Systems', due: 'May 21', assignee: 'maya', priority: true, description: 'Final discount and volume commitment negotiation.' },
  { id: 11, stage: 'negotiation', title: 'Contract Review', company: 'Massive Dynamic', due: 'May 20', assignee: 'jane', comments: 1, attachments: 1, description: 'Legal and procurement teams are reviewing the service contract.' },
  { id: 12, stage: 'negotiation', title: 'Terms & Conditions', company: 'Tyrell Corporation', due: 'May 20', assignee: 'robert', description: 'Review enterprise terms, renewal clause and support SLA.' },
  { id: 13, stage: 'won', title: 'CRM Deal', company: 'Daily Planet', due: 'May 20', assignee: 'lina', won: true, description: 'Enterprise CRM deal completed successfully.' },
  { id: 14, stage: 'won', title: 'Enterprise Plan', company: 'LexCorp', due: 'May 18', assignee: 'omar', won: true, description: 'Enterprise rollout approved for three divisions.' },
  { id: 15, stage: 'won', title: 'Long Term Deal', company: 'Vehement Capital', due: 'May 17', assignee: 'maya', won: true, description: 'Three-year services agreement signed and handed to onboarding.' },
];

const avatars = {
  jane: 'assets/avatar-jane.svg', robert: 'assets/avatar-robert.svg', lina: 'assets/avatar-lina.svg', omar: 'assets/avatar-omar.svg', maya: 'assets/avatar-maya.svg'
};

const state = { query: '', filter: 'all', selectedId: 7 };
const safeStorage = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch {} }
};
const kanban = document.querySelector('#kanban');
const detailPanel = document.querySelector('#detailPanel');
const scrim = document.querySelector('#scrim');
const sidebar = document.querySelector('#sidebar');
const modal = document.querySelector('#cardModal');
const toast = document.querySelector('#toast');

function icon(id) { return `<svg aria-hidden="true"><use href="#${id}"/></svg>`; }
function escapeHTML(value='') { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function visibleCards(stageId) {
  const q = state.query.toLowerCase().trim();
  return cards.filter(card => {
    const matchStage = card.stage === stageId;
    const matchQuery = !q || `${card.title} ${card.company}`.toLowerCase().includes(q);
    const matchFilter = state.filter === 'all' || (state.filter === 'high' && card.priority) || (state.filter === 'mine' && card.assignee === 'jane') || (state.filter === 'due' && ['May 24','May 25','May 26','May 27','May 28'].includes(card.due));
    return matchStage && matchQuery && matchFilter;
  });
}

function renderBoard() {
  kanban.innerHTML = stages.map(stage => {
    const stageCards = visibleCards(stage.id);
    return `<section class="kanban-column" data-stage="${stage.id}" style="--stage:${stage.color}">
      <header class="column-head"><span class="stage-dot"></span><h3>${stage.title}</h3><span class="column-count">${cards.filter(c=>c.stage===stage.id).length}</span><button class="column-add" data-add-stage="${stage.id}" aria-label="Add to ${stage.title}">${icon('i-plus')}</button></header>
      <div class="card-list" data-dropzone="${stage.id}">
        ${stageCards.length ? stageCards.map(cardTemplate).join('') : '<div class="empty-state">No matching cards</div>'}
      </div>
      <button class="add-card-row" data-add-stage="${stage.id}">${icon('i-plus')} Add another card</button>
    </section>`;
  }).join('');
  bindBoardEvents();
}

function cardTemplate(card) {
  return `<article class="task-card ${card.id===state.selectedId?'selected':''}" draggable="true" data-id="${card.id}">
    ${card.priority ? '<span class="priority-flag"></span>' : ''}
    <div class="card-top"><strong>${escapeHTML(card.title)}</strong><button class="card-menu" aria-label="Card actions">${icon('i-more')}</button></div>
    <a class="company" href="#">${escapeHTML(card.company)}</a>
    <div class="card-bottom"><img src="${avatars[card.assignee]}" alt="Assignee"/><div class="card-meta">
      ${card.won ? '<span class="won-pill">Won</span>' : ''}
      ${card.comments ? `<span>${icon('i-message')}${card.comments}</span>` : ''}
      ${card.attachments ? `<span>${icon('i-paperclip')}${card.attachments}</span>` : ''}
      <span class="due">${card.due || ''}</span>
    </div></div>
  </article>`;
}

function bindBoardEvents() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => selectCard(Number(card.dataset.id)));
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  document.querySelectorAll('[data-add-stage]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.addStage)));
  document.querySelectorAll('[data-dropzone]').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.closest('.kanban-column').classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.closest('.kanban-column').classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      const id = Number(e.dataTransfer.getData('text/plain'));
      const card = cards.find(c => c.id === id);
      if (card && card.stage !== zone.dataset.dropzone) {
        const oldStage = stages.find(s=>s.id===card.stage)?.title;
        card.stage = zone.dataset.dropzone;
        renderBoard(); updateDetails(card); showToast(`Moved “${card.title}” from ${oldStage}`);
      }
      zone.closest('.kanban-column').classList.remove('drag-over');
    });
  });
}

function selectCard(id) {
  state.selectedId = id;
  const card = cards.find(c => c.id === id);
  renderBoard(); updateDetails(card);
  if (window.innerWidth <= 1050) { detailPanel.classList.add('open'); scrim.classList.add('visible'); }
}

function updateDetails(card) {
  if (!card) return;
  document.querySelector('#detailTitle').textContent = card.title;
  document.querySelector('#detailCompany').textContent = card.company;
  document.querySelector('#detailDescription').textContent = card.description || 'No description added yet.';
  const stage = stages.find(s => s.id === card.stage)?.title || 'Opportunity';
  document.querySelector('.tag-orange').textContent = stage;
  document.querySelector('.tag-red').style.display = card.priority ? '' : 'none';
}

function openModal(stage='new') {
  modal.querySelector('[name="stage"]').value = stage;
  modal.showModal();
  setTimeout(() => modal.querySelector('[name="title"]').focus(), 30);
}

function closeOverlays() { sidebar.classList.remove('open'); detailPanel.classList.remove('open'); scrim.classList.remove('visible'); }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t = setTimeout(()=>toast.classList.remove('show'), 2400); }

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  safeStorage.set('nexora-theme', theme);
  document.querySelector('.theme-icon use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
}

function setGreeting() {
  const hour = new Date().getHours();
  const text = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.querySelector('#greeting').innerHTML = `${text}, Jane! <span>${hour < 18 ? '👋' : '🌙'}</span>`;
}

// Global controls
document.querySelector('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.querySelector('#newCardButton').addEventListener('click', () => openModal());
document.querySelector('#quickAdd').addEventListener('click', () => openModal());
document.querySelector('#menuButton').addEventListener('click', () => { sidebar.classList.add('open'); scrim.classList.add('visible'); });
document.querySelector('#closeDetail').addEventListener('click', closeOverlays);
scrim.addEventListener('click', closeOverlays);

document.querySelector('#searchInput').addEventListener('input', e => { state.query = e.target.value; renderBoard(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('#searchInput').focus(); }
  if (e.key === 'Escape') closeOverlays();
});

document.querySelector('#filterButton').addEventListener('click', () => {
  const strip = document.querySelector('#filterStrip'); strip.hidden = !strip.hidden;
});
document.querySelectorAll('#filterStrip button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#filterStrip button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.filter = btn.dataset.filter; renderBoard();
}));

document.querySelectorAll('.view-tabs button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.view-tabs button').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  const board = btn.dataset.view === 'board'; document.querySelector('#boardView').hidden = !board; document.querySelector('#alternateView').hidden = board;
  if (!board) document.querySelector('#alternateTitle').textContent = `${btn.textContent} view`;
}));
document.querySelector('#backToBoard').addEventListener('click', () => document.querySelector('[data-view="board"]').click());

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  if (btn.dataset.nav !== 'Trello Board') showToast(`${btn.dataset.nav} module is ready for your backend integration`);
  if (window.innerWidth <= 760) closeOverlays();
}));

document.querySelector('#cardForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const stage = data.get('stage');
  const rawDate = data.get('date');
  const date = rawDate ? new Date(`${rawDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Jun 02';
  const card = { id: Date.now(), stage, title: data.get('title').trim(), company: data.get('company').trim(), due: date, assignee: 'jane', priority: data.get('priority') === 'on', description: 'New opportunity created from the Nexora CRM quick-add workflow.' };
  cards.push(card); state.selectedId = card.id; modal.close(); e.currentTarget.reset(); renderBoard(); updateDetails(card); showToast('New CRM card created');
});

document.querySelector('#commentForm').addEventListener('submit', e => {
  e.preventDefault(); const input = document.querySelector('#commentInput'); const text = input.value.trim(); if (!text) return;
  const section = document.querySelector('.activity-section'); const row = document.createElement('div'); row.className = 'activity'; row.innerHTML = `<img src="assets/avatar-jane.svg" alt="Jane"><p><strong>Jane Cooper</strong> ${escapeHTML(text)}</p><time>now</time>`; section.appendChild(row); input.value=''; showToast('Comment added');
});

const savedTheme = safeStorage.get('nexora-theme');
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
setGreeting(); renderBoard(); updateDetails(cards.find(c=>c.id===state.selectedId));
