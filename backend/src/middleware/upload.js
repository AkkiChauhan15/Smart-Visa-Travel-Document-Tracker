import multer from 'multer';
import { getConfig } from '../config/env.js';

const config = getConfig();

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
    fields: 3,
    parts: 4,
  },
}).single('file');

