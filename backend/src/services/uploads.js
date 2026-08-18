import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute folder for uploaded files (Hostinger-safe, next to backend root). */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

const PRODUCTION_DIR = path.join(UPLOAD_ROOT, 'production');

const ALLOWED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'rar', 'mp4', 'mov', 'webm',
]);

export function ensureUploadDirs() {
  fs.mkdirSync(PRODUCTION_DIR, { recursive: true });
}

export function fileExtOf(name) {
  const base = String(name || '').trim().split(/[?#]/)[0];
  const parts = base.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.pop() || '';
}

export function isAllowedUploadName(name) {
  return ALLOWED_EXT.has(fileExtOf(name));
}

/**
 * Attachment URLs are stored host-less (`/api/uploads/...`) and the browser
 * re-anchors them on the API origin. Baking in a host taken from proxy headers
 * produced dead links whenever the request arrived through the site domain
 * instead of the API domain.
 */
export function toPublicUploadUrl(relativePath) {
  const rel = String(relativePath || '').replace(/^\/+/, '');
  // Under /api/uploads so the Hostinger API proxy always serves the file
  return `/api/uploads/${rel}`;
}

function safeOriginalBase(name) {
  const ext = fileExtOf(name);
  const stem = String(name || 'file')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 60) || 'file';
  return ext ? `${stem}.${ext}` : stem;
}

/**
 * Persist a Buffer to uploads/production and return metadata.
 * @returns {{ id, name, size, type, url, relativePath, uploadedAt }}
 */
export function saveUploadBuffer({
  buffer,
  originalName,
  mimeType = 'application/octet-stream',
  id = null,
}) {
  ensureUploadDirs();
  const ext = fileExtOf(originalName);
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(`File type ".${ext || '?'}" is not allowed`);
    err.status = 400;
    throw err;
  }
  const size = Buffer.byteLength(buffer);
  if (!(size > 0) || size > 5 * 1024 * 1024) {
    const err = new Error('Each file must be between 1 byte and 5 MB');
    err.status = 400;
    throw err;
  }

  const fileId = id ?? Date.now() + Math.random();
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeOriginalBase(originalName)}`;
  const relativePath = path.posix.join('production', storedName);
  const absPath = path.join(UPLOAD_ROOT, 'production', storedName);
  fs.writeFileSync(absPath, buffer);

  return {
    id: fileId,
    name: String(originalName || storedName).slice(0, 180),
    size,
    type: String(mimeType || 'application/octet-stream').slice(0, 120),
    url: toPublicUploadUrl(relativePath),
    relativePath,
    uploadedAt: new Date().toISOString(),
  };
}

/** Parse data:[mime];base64,… into a Buffer + mime. */
export function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!m) return null;
  try {
    return {
      mime: m[1] || 'application/octet-stream',
      buffer: Buffer.from(m[2], 'base64'),
    };
  } catch {
    return null;
  }
}

/**
 * If file.url is a data: URL, write it to disk and return http(s) metadata.
 * Otherwise return the file unchanged (http URLs / already migrated).
 */
export function materializeFileAttachment(file) {
  if (!file || typeof file !== 'object') return file;
  const url = String(file.url || file.fileUrl || '');
  if (!url.startsWith('data:')) {
    return {
      id: file.id ?? Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: file.url || file.fileUrl || null,
      uploadedAt: file.uploadedAt || new Date().toISOString(),
    };
  }
  const parsed = parseDataUrl(url);
  if (!parsed || !parsed.buffer?.length) {
    const err = new Error(`Could not decode file "${file.name || 'attachment'}"`);
    err.status = 400;
    throw err;
  }
  return saveUploadBuffer({
    buffer: parsed.buffer,
    originalName: file.name || 'file.bin',
    mimeType: file.type || parsed.mime,
    id: file.id,
  });
}
