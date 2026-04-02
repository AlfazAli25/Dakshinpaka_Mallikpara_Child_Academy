const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../../uploads/payment-screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-${Math.floor(Math.random() * 1000000)}${extension}`);
  }
});

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
