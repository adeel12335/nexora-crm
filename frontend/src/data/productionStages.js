/** Production board workflow stages (Wiki Studio pipeline). */
export const productionStages = [
  { id: 'new_project_create_draft', title: 'New Project / Create Draft', color: '#6A9FB5' },
  { id: 'page_expansion', title: 'Page Expansion', color: '#07524D' },
  { id: 'draft_done', title: 'Draft Done', color: '#4E9A6A' },
  { id: 'draft_revisions', title: 'Draft Revisions / Comments', color: '#D8A74C' },
  { id: 'pending_approval', title: 'Pending for Approval', color: '#C65A79' },
  { id: 'push_to_live', title: 'Push Page to Live', color: '#8B5CF6' },
  { id: 'page_live', title: 'Page Live', color: '#2F6FED' },
  { id: 'edits_after_publishing', title: 'Edits After Publishing', color: '#EA580C' },
  { id: 'pages_to_relive', title: 'Pages to Re-live', color: '#0D9488' },
  { id: 'stopped_process', title: 'Stopped Process', color: '#A2A2A0' },
];

const LEGACY_STAGE_MAP = {
  new_draft: 'new_project_create_draft',
  in_progress: 'page_expansion',
  revision: 'draft_revisions',
  review: 'pending_approval',
  live: 'page_live',
  done: 'stopped_process',
};

const LIVE_LINK_STAGES = new Set(['page_live', 'pages_to_relive']);

export function normalizeProductionStage(stage) {
  const key = String(stage || '').trim();
  if (!key) return productionStages[0].id;
  if (LEGACY_STAGE_MAP[key]) return LEGACY_STAGE_MAP[key];
  if (productionStages.some((s) => s.id === key)) return key;
  return productionStages[0].id;
}

export function requiresLiveLink(stage) {
  return LIVE_LINK_STAGES.has(normalizeProductionStage(stage));
}

export function isLiveLikeStage(stage) {
  const id = normalizeProductionStage(stage);
  return id === 'page_live' || id === 'pages_to_relive' || id === 'push_to_live';
}

export function stageTitle(stage) {
  const id = normalizeProductionStage(stage);
  return productionStages.find((s) => s.id === id)?.title || id.replaceAll('_', ' ');
}
