/** Where an attachment actually lives — used to open PDF/DOC/images correctly. */
export function attachmentSource(url) {
  const raw = String(url || '').trim();
  if (!raw) return 'missing';
  if (raw.startsWith('data:')) return 'blob';
  if (raw.startsWith('blob:')) return 'local';
  if (/trello\.com\//i.test(raw)) return 'trello';
  if (/(?:^https?:\/\/[^/]+)?\/(?:api\/)?uploads\//i.test(raw)) return 'server';
  if (/^https?:\/\//i.test(raw)) return 'remote';
  return 'other';
}

export function isExternalAttachment(url) {
  const source = attachmentSource(url);
  return source === 'trello' || source === 'remote';
}
