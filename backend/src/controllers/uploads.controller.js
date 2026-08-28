import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import {
  ensureUploadDirs,
  finalizeStoredUpload,
  isAllowedUploadName,
  materializeFileAttachment,
  rewriteExtrasFileUrls,
  UPLOAD_ROOT,
  UPLOAD_TMP_DIR,
} from '../services/uploads.js';
import { enqueueUploadWork } from '../services/uploadQueue.js';
import { pool } from '../config/db.js';

ensureUploadDirs();

const diskUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      ensureUploadDirs();
      cb(null, UPLOAD_TMP_DIR);
    },
    filename(_req, _file, cb) {
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedUploadName(file.originalname)) {
      const err = new Error(`File type for "${file.originalname}" is not allowed`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

export const uploadProductionFilesMiddleware = diskUpload.array('files', 10);

async function unlinkTempFiles(files) {
  await Promise.all(
    (files || []).map((file) => {
      if (!file?.path) return Promise.resolve();
      return fs.promises.unlink(file.path).catch(() => {});
    }),
  );
}

/**
 * POST /api/production/uploads
 * multipart field name: files
 * Streams to disk, then hashes into a content-addressed cache so repeats
 * skip a second write and Hostinger I/O stays serial.
 */
export async function uploadProductionFiles(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    return res.status(400).json({ error: 'No files uploaded — use form field "files"' });
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (totalBytes > 8 * 1024 * 1024) {
      await unlinkTempFiles(files);
      return res.status(400).json({ error: 'Files together cannot exceed 8 MB' });
    }
  }

  const saved = [];
  try {
    for (const file of files) {
      const meta = await enqueueUploadWork(() => finalizeStoredUpload({
        tempPath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      }));
      saved.push(meta);
    }
  } catch (err) {
    await unlinkTempFiles(files);
    throw err;
  }

  res.status(201).json({
    files: saved.map(({ relativePath, cached, ...rest }) => rest),
  });
}

function parseExtras(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function materializeList(list, urlKey = 'url') {
  if (!Array.isArray(list)) return { list: [], converted: 0 };
  let converted = 0;
  const next = list.map((item) => {
    const url = String(item?.[urlKey] || item?.url || item?.fileUrl || '');
    if (!url.startsWith('data:')) return item;
    const materialized = materializeFileAttachment({ ...item, url: item.url || item.fileUrl });
    converted += 1;
    if (urlKey === 'fileUrl') {
      return {
        ...item,
        ...materialized,
        fileUrl: materialized.url,
        url: undefined,
      };
    }
    return { ...item, ...materialized };
  });
  return { list: next, converted };
}

/**
 * Walk comment / file / delivery lists and write any data: URLs to disk.
 * Returns { extras, converted }.
 */
export function materializeExtrasDataUrls(extras) {
  const src = extras && typeof extras === 'object' ? extras : {};
  let converted = 0;

  const files = materializeList(src.fileList, 'url');
  converted += files.converted;

  const comments = Array.isArray(src.commentList) ? src.commentList.map((c) => {
    const nested = materializeList(c?.files, 'url');
    converted += nested.converted;
    return { ...c, files: nested.list };
  }) : [];

  const deliveries = Array.isArray(src.deliveryList) ? src.deliveryList.map((d) => {
    let item = { ...d };
    const topUrl = String(d?.fileUrl || d?.url || '');
    if (topUrl.startsWith('data:')) {
      const mat = materializeFileAttachment({
        name: d.name || 'delivery.bin', size: d.size, type: d.type, url: topUrl, id: d.id,
      });
      converted += 1;
      item = {
        ...item,
        fileUrl: mat.url,
        name: mat.name || item.name,
        size: mat.size ?? item.size,
        type: mat.type || item.type,
      };
    }
    const nested = materializeList(item.files, 'fileUrl');
    converted += nested.converted;
    item.files = nested.list.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      fileUrl: f.fileUrl || f.url || null,
    }));
    if (!item.fileUrl && item.files[0]?.fileUrl) {
      item.fileUrl = item.files[0].fileUrl;
      item.name = item.name || item.files[0].name;
      item.size = item.size ?? item.files[0].size;
      item.type = item.type || item.files[0].type;
    }
    return item;
  }) : [];

  return {
    extras: rewriteExtrasFileUrls({
      ...src,
      fileList: files.list,
      commentList: comments,
      deliveryList: deliveries,
    }),
    converted,
  };
}

/**
 * One-shot: convert every production card's base64 attachments to disk files.
 * Safe to re-run (skips http URLs).
 */
export async function migrateAllBase64Uploads() {
  ensureUploadDirs();
  const [rows] = await pool.query('SELECT id, extras_json FROM production_cards');
  let cardsTouched = 0;
  let filesConverted = 0;

  for (const row of rows) {
    const extras = parseExtras(row.extras_json);
    const raw = JSON.stringify(extras);
    if (!raw.includes('data:')) continue;

    const { extras: next, converted } = materializeExtrasDataUrls(extras);
    if (!converted) continue;

    await pool.query(
      'UPDATE production_cards SET extras_json = ?, attachments_count = ? WHERE id = ?',
      [
        JSON.stringify(next),
        Array.isArray(next.fileList) ? next.fileList.length : 0,
        row.id,
      ],
    );
    cardsTouched += 1;
    filesConverted += converted;
  }

  return { cardsTouched, filesConverted, uploadRoot: UPLOAD_ROOT };
}

/**
 * Rewrite Hostinger-absolute upload URLs to /api/uploads/... and drop any
 * leftover data: blobs. Safe to re-run.
 */
export async function migrateNormalizedAttachmentUrls() {
  const [rows] = await pool.query('SELECT id, extras_json, attachments_count FROM production_cards');
  let cardsTouched = 0;
  for (const row of rows) {
    const extras = parseExtras(row.extras_json);
    const next = rewriteExtrasFileUrls(extras);
    if (JSON.stringify(next) === JSON.stringify(extras)) continue;
    await pool.query(
      'UPDATE production_cards SET extras_json = ?, attachments_count = ? WHERE id = ?',
      [
        JSON.stringify(next),
        Array.isArray(next.fileList) ? next.fileList.length : (row.attachments_count || 0),
        row.id,
      ],
    );
    cardsTouched += 1;
  }
  return { cardsTouched };
}
