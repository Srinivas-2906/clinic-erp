import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage } from '@google-cloud/storage';
import { getClinicFilesConfig, buildObjectKey } from '../config/clinicFiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {{ saveObject(params: SaveParams): Promise<SaveResult>, openReadStream(params: OpenParams): Promise<OpenResult> }} UploadStorageBackend */

/** @type {UploadStorageBackend | null} */
let testBackendOverride = null;
/** @type {ReturnType<typeof createMemoryUploadStorage> | null} */
let memoryBackendSingleton = null;

export function setUploadStorageBackendForTests(backend) {
  testBackendOverride = backend;
}

export function resetUploadStorageBackendForTests() {
  testBackendOverride = null;
  memoryBackendSingleton = null;
}

function resolveBackend() {
  if (testBackendOverride) return testBackendOverride;
  const cfg = getClinicFilesConfig();
  if (cfg.storageMode === 'memory') {
    if (!memoryBackendSingleton) memoryBackendSingleton = createMemoryUploadStorage();
    return memoryBackendSingleton;
  }
  if (cfg.storageMode === 'local') {
    return createLocalBackend(cfg);
  }
  return createGcsBackend(cfg);
}

function createGcsBackend(cfg) {
  const storage = new Storage();
  const bucket = storage.bucket(cfg.bucket);
  return {
    async saveObject({ tenantId, fileName, buffer, contentType }) {
      const objectKey = buildObjectKey(cfg.prefix, tenantId, fileName);
      const file = bucket.file(objectKey);
      await file.save(buffer, {
        resumable: false,
        metadata: { contentType, cacheControl: 'private, max-age=0' },
      });
      return { objectKey, contentType };
    },
    async openReadStream({ tenantId, fileName }) {
      const objectKey = buildObjectKey(cfg.prefix, tenantId, fileName);
      const file = bucket.file(objectKey);
      const [exists] = await file.exists();
      if (!exists) {
        const err = new Error('File not found');
        err.code = 'NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      const [meta] = await file.getMetadata();
      const contentType = meta.contentType || 'application/octet-stream';
      return {
        stream: file.createReadStream(),
        contentType,
        contentDisposition: 'inline',
      };
    },
    async deleteObject({ tenantId, fileName }) {
      const objectKey = buildObjectKey(cfg.prefix, tenantId, fileName);
      const file = bucket.file(objectKey);
      await file.delete({ ignoreNotFound: true });
    },
  };
}

function createLocalBackend(cfg) {
  const uploadsRoot = cfg.uploadsDir || path.join(__dirname, '../../data/uploads');
  return {
    async saveObject({ tenantId, fileName, buffer, contentType }) {
      const dir = path.join(uploadsRoot, tenantId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, buffer);
      return {
        objectKey: buildObjectKey(cfg.prefix, tenantId, fileName),
        contentType,
        _localPath: filePath,
      };
    },
    async openReadStream({ tenantId, fileName }) {
      const safeName = validateLocalPath(tenantId, fileName, uploadsRoot);
      if (!safeName || !fs.existsSync(safeName)) {
        const err = new Error('File not found');
        err.code = 'NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      return {
        stream: fs.createReadStream(safeName),
        contentType: detectContentTypeFromName(fileName),
        contentDisposition: 'inline',
      };
    },
    async deleteObject({ tenantId, fileName }) {
      const safeName = validateLocalPath(tenantId, fileName, uploadsRoot);
      if (safeName && fs.existsSync(safeName)) fs.unlinkSync(safeName);
    },
  };
}

function validateLocalPath(tenantId, fileName, uploadsRoot) {
  const full = path.join(uploadsRoot, tenantId, fileName);
  const resolvedRoot = path.resolve(uploadsRoot);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) return null;
  return resolved;
}

function detectContentTypeFromName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'image/jpeg';
}

/** In-memory fake for tests (never touches GCS). */
export function createMemoryUploadStorage() {
  /** @type {Map<string, { buffer: Buffer, contentType: string }>} */
  const objects = new Map();
  const cfg = () => getClinicFilesConfig();
  return {
    objects,
    async saveObject({ tenantId, fileName, buffer, contentType }) {
      const key = buildObjectKey(cfg().prefix, tenantId, fileName);
      if (objects.has(key)) {
        const err = new Error('Object already exists');
        err.code = 'ALREADY_EXISTS';
        throw err;
      }
      objects.set(key, { buffer: Buffer.from(buffer), contentType });
      return { objectKey: key, contentType };
    },
    async openReadStream({ tenantId, fileName }) {
      const key = buildObjectKey(cfg().prefix, tenantId, fileName);
      const hit = objects.get(key);
      if (!hit) {
        const err = new Error('File not found');
        err.code = 'NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      const { Readable } = await import('stream');
      const stream = Readable.from(hit.buffer);
      return {
        stream,
        contentType: hit.contentType,
        contentDisposition: 'inline',
      };
    },
    async deleteObject({ tenantId, fileName }) {
      const key = buildObjectKey(cfg().prefix, tenantId, fileName);
      objects.delete(key);
    },
  };
}

export function getUploadStorageBackend() {
  return resolveBackend();
}
