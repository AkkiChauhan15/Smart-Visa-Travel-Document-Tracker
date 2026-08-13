import { HttpError } from '../utils/http-error.js';
import multer from 'multer';
import { UniqueConstraintError } from 'sequelize';

export function errorHandler(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file exceeds the size limit' : 'Invalid file upload';
    return res.status(status).json({ error: { message } });
  }

  if (error instanceof UniqueConstraintError) {
    return res.status(409).json({ error: { message: 'A record with these identifying details already exists' } });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { message: error.message, ...(error.details && { details: error.details }) },
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(422).json({
      error: {
        message: 'Validation failed',
        details: error.errors.map((item) => ({ field: item.path, message: item.message })),
      },
    });
  }

  console.error(error);
  return res.status(500).json({ error: { message: 'Internal server error' } });
}
