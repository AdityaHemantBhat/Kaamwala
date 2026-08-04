import multer from 'multer';

// Memory storage for Cloudinary upload
const storage = multer.memoryStorage();

// Defense in depth: reject obviously-wrong MIME types at the middleware layer.
// Authoritative validation (magic bytes) happens in media.service.
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 6,                  // max 6 images per request
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP, AVIF) are allowed'));
    }
  },
});
