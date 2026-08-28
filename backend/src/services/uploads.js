import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function uniqueResolved(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    if (!dir) continue;
    const abs = path.resolve(dir);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/**
 * Git deploys wipe untracked `backend/uploads`. In production, keep bytes
 * under $HOME/nexora-uploads so Hostinger pull/restart does not delete them.
 */
function defaultWriteRoot() {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  if (process.env.NODE_ENV === 'production') {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home) return path.join(home, 'nexora-uploads');
  }
  return path.resolve(__dirname, '../../uploads');
}

/** Absolute folder for uploaded files (Hostinger-safe). */
export const UPLOAD_ROOT = defaultWriteRoot();

export function uploadLookupRoots() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return uniqueResolved([
    process.env.UPLOAD_DIR,
    UPLOAD_ROOT,
    home ? path.join(home, 'nexora-uploads') : null,
    path.resolve(__dirname, '../../uploads'),
  ]);
}

/**
 * Find a stored upload on disk. Tries the write root, legacy repo folder,
 * and a timestamp-prefix match when the sanitized filename drifted.
 */
export function resolveUploadOnDisk(rel) {
  const safe = String(rel || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!safe || safe.includes('..')) return null;
  const posixRel = safe.split('/').filter(Boolean).join('/');

  for (const root of uploadLookupRoots()) {
    const abs = path.resolve(root, ...posixRel.split('/'));
    const rootAbs = path.resolve(root);
    if (!abs.startsWith(rootAbs + path.sep) && abs !== rootAbs) continue;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch {
      // keep looking
    }
  }

  const base = path.posix.basename(posixRel);
  const prefix = base.match(/^(\d{10,}-[a-f0-9]{8,})/i);
  if (!prefix) return null;
  const dirRel = path.posix.dirname(posixRel);
  for (const root of uploadLookupRoots()) {
    const dir = dirRel === '.' ? root : path.resolve(root, ...dirRel.split('/'));
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      const hit = fs.readdirSync(dir).find((name) => name.startsWith(prefix[1]));
      if (!hit) continue;
      const abs = path.join(dir, hit);
      if (fs.statSync(abs).isFile()) return abs;
    } catch {
      // keep looking
    }
  }
  return null;
}

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

/** True when this URL is a file we store under /api/uploads. */
export function isOurUploadUrl(url) {
  const raw = String(url || '');
  return /(?:^https?:\/\/[^/]+)?\/(?:api\/)?uploads\//i.test(raw);
}

/**
 * Keep our files host-less. Drop leftover data: blobs so MySQL never stores
 * base64. Leave Trello / other https links untouched.
 */
export function normalizeStoredFileUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  const hosted = raw.match(/^https?:\/\/[^/]+(\/(?:api\/)?uploads\/.+)$/i);
  if (hosted) {
    const path = hosted[1].startsWith('/api/') ? hosted[1] : `/api${hosted[1]}`;
    return path.split(/[?#]/)[0];
  }
  if (raw.startsWith('/uploads/')) return `/api${raw.split(/[?#]/)[0]}`;
  if (raw.startsWith('/api/uploads/')) return raw.split(/[?#]/)[0];
  return raw;
}

function rewriteFileRecord(file) {
  if (!file || typeof file !== 'object') return file;
  const nextUrl = normalizeStoredFileUrl(file.url || file.fileUrl);
  const out = { ...file, url: nextUrl };
  if (file.fileUrl !== undefined) out.fileUrl = nextUrl;
  return out;
}

/** Strip data: blobs and re-anchor Hostinger upload URLs in extras JSON. */
export function rewriteExtrasFileUrls(extras) {
  const src = extras && typeof extras === 'object' ? extras : {};
  return {
    ...src,
    fileList: Array.isArray(src.fileList) ? src.fileList.map(rewriteFileRecord) : src.fileList,
    commentList: Array.isArray(src.commentList)
      ? src.commentList.map((c) => ({
          ...c,
          files: Array.isArray(c?.files) ? c.files.map(rewriteFileRecord) : c.files,
        }))
      : src.commentList,
    deliveryList: Array.isArray(src.deliveryList)
      ? src.deliveryList.map((d) => ({
          ...d,
          fileUrl: normalizeStoredFileUrl(d?.fileUrl || d?.url) || d?.fileUrl,
          files: Array.isArray(d?.files) ? d.files.map(rewriteFileRecord) : d.files,
        }))
      : src.deliveryList,
  };
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
