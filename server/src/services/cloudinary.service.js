const { v2: cloudinary } = require('cloudinary');

let isConfigured = false;

const ensureConfigured = () => {
  if (isConfigured) {
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    error.statusCode = 500;
    throw error;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  isConfigured = true;
};

const uploadPaymentScreenshot = async ({ buffer, mimeType, originalName }) => {
  if (!buffer || buffer.length === 0) {
    const error = new Error('Screenshot file is empty');
    error.statusCode = 400;
    throw error;
  }

  ensureConfigured();

  const base64File = buffer.toString('base64');
  const dataUri = `data:${mimeType || 'image/png'};base64,${base64File}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: process.env.CLOUDINARY_FOLDER || 'sms/payment-screenshots',
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    tags: ['payment-screenshot'],
    context: originalName ? `original_name=${originalName}` : undefined
  });

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id
  };
};

module.exports = {
  uploadPaymentScreenshot
};
