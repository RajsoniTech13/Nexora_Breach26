// src/config/multer.ts
import multer from 'multer';
import path from 'path';

// Store files in memory (as a Buffer) — we'll send them directly to Gemini
// We do NOT save to disk because we only need the image temporarily
const storage = multer.memoryStorage();

// Only allow image files
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and HEIC images are allowed'));
  }
};

export const uploadReceipt = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});