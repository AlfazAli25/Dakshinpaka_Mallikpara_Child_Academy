const multer = require('multer');
const path = require('path');

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif'
]);

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif']);

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();
  const isImageMime = mimeType.startsWith('image/');
  const isAllowedMime = allowedMimeTypes.has(mimeType);
  const isAllowedExtension = allowedExtensions.has(extension);

  if (!isImageMime && !isAllowedExtension) {
    const error = new Error('Only image screenshots are allowed (JPG, PNG, WEBP, HEIC, AVIF)');
    error.statusCode = 400;
    cb(error);
    return;
  }

  if (isImageMime && !isAllowedMime && !isAllowedExtension) {
    const error = new Error('Unsupported screenshot format. Please upload JPG, PNG, WEBP, HEIC, or AVIF image.');
    error.statusCode = 400;
    cb(error);
    return;
  }

  cb(null, true);
};

const screenshotUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

module.exports = { screenshotUpload };
