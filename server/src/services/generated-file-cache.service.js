const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'generated-cache');
const isServerlessRuntime = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);
const CACHE_DIR = process.env.GENERATED_FILE_CACHE_DIR
  ? path.resolve(process.env.GENERATED_FILE_CACHE_DIR)
  : isServerlessRuntime
    ? path.resolve(os.tmpdir(), 'generated-file-cache')
    : DEFAULT_CACHE_DIR;
const DEFAULT_TTL_MS = Number(process.env.GENERATED_FILE_CACHE_TTL_MS || 10 * 60 * 1000);
const MAX_CACHE_ENTRIES = Number(process.env.GENERATED_FILE_CACHE_MAX_ENTRIES || 200);
const CLEANUP_INTERVAL_MS = Number(process.env.GENERATED_FILE_CACHE_CLEANUP_INTERVAL_MS || 60 * 1000);

const fileCache = new Map();
let lastCleanupAt = 0;

const now = () => Date.now();

const toSafeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const ensureCacheDir = async () => {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
};

const hashKey = (value) => crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex');

const sanitizeFileName = (fileName = 'Generated_File') =>
  String(fileName || 'Generated_File')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_') || 'Generated_File';

const normalizeContentType = (contentType) => {
  const normalized = String(contentType || '').trim().toLowerCase();
  if (normalized) {
    return normalized;
  }

  return 'application/octet-stream';
};

const resolveExtension = ({ extension, fileName, contentType }) => {
  const explicitExt = String(extension || '').trim();
  if (explicitExt) {
    return explicitExt.startsWith('.') ? explicitExt : `.${explicitExt}`;
  }

  const fileNameExt = path.extname(String(fileName || '').trim());
  if (fileNameExt) {
    return fileNameExt;
  }

  const normalizedType = normalizeContentType(contentType);
  if (normalizedType === 'application/pdf') {
    return '.pdf';
  }

  if (normalizedType === 'application/zip') {
    return '.zip';
  }

  return '.bin';
};

const buildTempPath = ({ cacheId, extension }) => path.resolve(CACHE_DIR, `${cacheId}${extension}.tmp`);
const buildFinalPath = ({ cacheId, extension }) => path.resolve(CACHE_DIR, `${cacheId}${extension}`);

const fileExists = async (filePath) => {
  try {
    await fsp.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
};

const removeFileIfExists = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch (_error) {
    // Ignore cleanup errors.
  }
};

const cleanupExpiredCacheEntries = async () => {
  const current = now();
  if (current - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = current;

  const expiredKeys = [];
  for (const [cacheKey, entry] of fileCache.entries()) {
    if (!entry || entry.expiresAt <= current) {
      expiredKeys.push(cacheKey);
    }
  }

  await Promise.all(
    expiredKeys.map(async (cacheKey) => {
      const entry = fileCache.get(cacheKey);
      fileCache.delete(cacheKey);
      await removeFileIfExists(entry?.filePath);
    })
  );
};

const trimCacheIfNeeded = async () => {
  const maxEntries = toSafeNumber(MAX_CACHE_ENTRIES, 200);
  if (fileCache.size <= maxEntries) {
    return;
  }

  const orderedEntries = [...fileCache.entries()].sort((a, b) => {
    const leftTime = Number(a?.[1]?.createdAt || 0);
    const rightTime = Number(b?.[1]?.createdAt || 0);
    return leftTime - rightTime;
  });

  const overflowCount = fileCache.size - maxEntries;
  const entriesToDrop = orderedEntries.slice(0, overflowCount);

  await Promise.all(
    entriesToDrop.map(async ([cacheKey, entry]) => {
      fileCache.delete(cacheKey);
      await removeFileIfExists(entry?.filePath);
    })
  );
};

const readFileSize = async (filePath) => {
  try {
    const stat = await fsp.stat(filePath);
    return Number(stat?.size || 0);
  } catch (_error) {
    return 0;
  }
};

const getOrCreateGeneratedFile = async ({
  cacheKey,
  fileName,
  contentType,
  ttlMs,
  extension,
  generateBuffer,
  generateFile
}) => {
  if (!cacheKey) {
    const error = new Error('cacheKey is required');
    error.statusCode = 500;
    throw error;
  }

  if (typeof generateBuffer !== 'function' && typeof generateFile !== 'function') {
    const error = new Error('Either generateBuffer or generateFile must be provided');
    error.statusCode = 500;
    throw error;
  }

  await ensureCacheDir();
  await cleanupExpiredCacheEntries();

  const normalizedCacheKey = String(cacheKey);
  const existing = fileCache.get(normalizedCacheKey);
  const current = now();

  if (existing && existing.expiresAt > current && (await fileExists(existing.filePath))) {
    return {
      ...existing,
      cacheHit: true
    };
  }

  if (existing) {
    fileCache.delete(normalizedCacheKey);
    await removeFileIfExists(existing.filePath);
  }

  const normalizedFileName = sanitizeFileName(fileName || 'Generated_File');
  const normalizedContentType = normalizeContentType(contentType);
  const resolvedExtension = resolveExtension({ extension, fileName: normalizedFileName, contentType: normalizedContentType });
  const cacheId = hashKey(normalizedCacheKey);
  const tempPath = buildTempPath({ cacheId, extension: resolvedExtension });
  const finalPath = buildFinalPath({ cacheId, extension: resolvedExtension });

  await removeFileIfExists(tempPath);

  if (typeof generateFile === 'function') {
    await generateFile(tempPath);
  } else {
    const generatedBuffer = await generateBuffer();
    const normalizedBuffer = Buffer.isBuffer(generatedBuffer)
      ? generatedBuffer
      : Buffer.from(generatedBuffer || []);

    await fsp.writeFile(tempPath, normalizedBuffer);
  }

  await removeFileIfExists(finalPath);
  await fsp.rename(tempPath, finalPath);

  const expiresInMs = toSafeNumber(ttlMs, DEFAULT_TTL_MS);
  const nextEntry = {
    filePath: finalPath,
    fileName: normalizedFileName,
    contentType: normalizedContentType,
    byteLength: await readFileSize(finalPath),
    createdAt: current,
    expiresAt: current + expiresInMs
  };

  fileCache.set(normalizedCacheKey, nextEntry);
  await trimCacheIfNeeded();

  return {
    ...nextEntry,
    cacheHit: false
  };
};

const streamGeneratedFile = (res, generatedFile, headers = {}) => {
  const fileName = String(generatedFile?.fileName || 'Generated_File').trim() || 'Generated_File';

  res.setHeader('Content-Type', generatedFile?.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', Number(generatedFile?.byteLength || 0));

  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'private, max-age=60');
  }

  for (const [headerName, headerValue] of Object.entries(headers || {})) {
    if (headerValue !== undefined && headerValue !== null && headerValue !== '') {
      res.setHeader(headerName, String(headerValue));
    }
  }

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(generatedFile.filePath);

    fileStream.on('error', reject);
    fileStream.on('end', resolve);

    fileStream.pipe(res);
  });
};

module.exports = {
  getOrCreateGeneratedFile,
  streamGeneratedFile
};
