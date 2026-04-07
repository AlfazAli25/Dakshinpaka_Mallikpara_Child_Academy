const DEFAULT_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);
const DEFAULT_MAX_EDGE = 1920;

const QUALITY_STEPS = [0.86, 0.76, 0.66, 0.56, 0.46];
const SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4];

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/png': '.png'
};

const isFileLike = (value) => typeof File !== 'undefined' && value instanceof File;

const getMimeCandidates = (inputMimeType = '') => {
  const normalized = String(inputMimeType || '').toLowerCase();
  if (normalized === 'image/webp') {
    return ['image/webp', 'image/jpeg'];
  }

  // PNG screenshots compress far better when converted to JPEG/WEBP.
  if (normalized === 'image/png') {
    return ['image/jpeg', 'image/webp'];
  }

  return ['image/jpeg', 'image/webp'];
};

const replaceExtension = (fileName, mimeType) => {
  const extension = EXT_BY_MIME[mimeType] || '.jpg';
  const normalizedName = String(fileName || 'screenshot').trim() || 'screenshot';
  const baseName = normalizedName.replace(/\.[^.]+$/, '');
  return `${baseName}${extension}`;
};

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load selected image'));
    };

    image.src = objectUrl;
  });

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to convert screenshot'));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });

const toUploadFile = (blob, originalName) =>
  new File([blob], replaceExtension(originalName, blob.type), {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now()
  });

export const prepareScreenshotForUpload = async (
  inputFile,
  { maxBytes = DEFAULT_MAX_BYTES, maxEdge = DEFAULT_MAX_EDGE } = {}
) => {
  if (!isFileLike(inputFile)) {
    return inputFile;
  }

  const targetMaxBytes = Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
    ? Number(maxBytes)
    : DEFAULT_MAX_BYTES;

  if (inputFile.size <= targetMaxBytes) {
    return inputFile;
  }

  if (!String(inputFile.type || '').toLowerCase().startsWith('image/')) {
    return inputFile;
  }

  let image;
  try {
    image = await loadImage(inputFile);
  } catch (_error) {
    return inputFile;
  }

  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) {
    return inputFile;
  }

  const effectiveMaxEdge = Number.isFinite(Number(maxEdge)) && Number(maxEdge) > 0
    ? Number(maxEdge)
    : DEFAULT_MAX_EDGE;

  const ratioFromEdge = Math.min(1, effectiveMaxEdge / Math.max(sourceWidth, sourceHeight));
  const mimeCandidates = getMimeCandidates(inputFile.type);

  let bestBlob = null;

  for (const scaleStep of SCALE_STEPS) {
    const ratio = Math.min(1, ratioFromEdge * scaleStep);
    const targetWidth = Math.max(1, Math.round(sourceWidth * ratio));
    const targetHeight = Math.max(1, Math.round(sourceHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      continue;
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    for (const mimeType of mimeCandidates) {
      for (const quality of QUALITY_STEPS) {
        let blob;
        try {
          blob = await canvasToBlob(canvas, mimeType, quality);
        } catch (_error) {
          continue;
        }

        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }

        if (blob.size <= targetMaxBytes) {
          return toUploadFile(blob, inputFile.name);
        }
      }
    }
  }

  if (bestBlob && bestBlob.size < inputFile.size) {
    return toUploadFile(bestBlob, inputFile.name);
  }

  return inputFile;
};

export const SCREENSHOT_UPLOAD_MAX_BYTES = DEFAULT_MAX_BYTES;