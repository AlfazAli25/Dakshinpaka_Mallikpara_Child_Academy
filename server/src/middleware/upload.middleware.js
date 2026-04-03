const multer = require('multer');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (!allowedTypes.has(file.mimetype)) {
    const error = new Error('Only PNG, JPG, and WEBP screenshots are allowed');
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
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = { screenshotUpload };
