import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute folder for uploaded files (Hostinger-safe, next to backend root). */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

export const PRODUCTION_DIR = path.join(UPLOAD_ROOT, 'production');
export const UPLOAD_TMP_DIR = path.join(UPLOAD_ROOT, 'tmp');

const ALLOWED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'rar', 'mp4', 'mov', 'webm',
]);

export function ensureUploadDirs() {
  fs.mkdirSync(PRODUCTION_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
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

export function isHashedUploadPath(rel) {
  return /(?:^|\/)[a-f0-9]{64}\.[a-z0-9]+$/i.test(String(rel || ''));
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

function assertAllowedExt(originalName) {
  const ext = fileExtOf(originalName);
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(`File type ".${ext || '?'}" is not allowed`);
    err.status = 400;
    throw err;
  }
  return ext;
}

function assertSize(size) {
  if (!(size > 0) || size > 5 * 1024 * 1024) {
    const err = new Error('Each file must be between 1 byte and 5 MB');
    err.status = 400;
    throw err;
  }
}

function metaFor({ originalName, mimeType, size, relativePath, id }) {
  return {
    id: id ?? Date.now() + Math.random(),
    name: String(originalName || relativePath).slice(0, 180),
    size,
    type: String(mimeType || 'application/octet-stream').slice(0, 120),
    url: toPublicUploadUrl(relativePath),
    relativePath,
    uploadedAt: new Date().toISOString(),
  };
}

export function contentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function hashFilePath(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function moveOrCopy(src, dest) {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src).catch(() => {});
  }
}

/**
 * Persist a Buffer to uploads/production and return metadata.
 * Identical content is stored once (sha256 filename) and reused.
 * @returns {{ id, name, size, type, url, relativePath, uploadedAt, cached }}
 */
export function saveUploadBuffer({
  buffer,
  originalName,
  mimeType = 'application/octet-stream',
  id = null,
}) {
  ensureUploadDirs();
  const ext = assertAllowedExt(originalName);
  const size = Buffer.byteLength(buffer);
  assertSize(size);

  const hash = contentHash(buffer);
  const storedName = `${hash}.${ext}`;
  const relativePath = path.posix.join('production', storedName);
  const absPath = path.join(PRODUCTION_DIR, storedName);
  const cached = fs.existsSync(absPath);
  if (!cached) fs.writeFileSync(absPath, buffer);

  return {
    ...metaFor({ originalName, mimeType, size, relativePath, id }),
    cached,
  };
}

/**
 * Move a multer temp file into the content-addressed production folder.
 * Duplicate bytes return the existing URL without rewriting disk.
 */
export async function finalizeStoredUpload({
  tempPath,
  originalName,
  mimeType = 'application/octet-stream',
  size = 0,
  id = null,
}) {
  ensureUploadDirs();
  const ext = assertAllowedExt(originalName);
  const bytes = Number(size) || 0;
  assertSize(bytes);

  try {
    const hash = await hashFilePath(tempPath);
    const storedName = `${hash}.${ext}`;
    const relativePath = path.posix.join('production', storedName);
    const dest = path.join(PRODUCTION_DIR, storedName);
    const cached = fs.existsSync(dest);
    if (cached) {
      await fs.promises.unlink(tempPath).catch(() => {});
    } else {
      await moveOrCopy(tempPath, dest);
    }
    return {
      ...metaFor({ originalName, mimeType, size: bytes, relativePath, id }),
      cached,
    };
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw err;
  }
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
