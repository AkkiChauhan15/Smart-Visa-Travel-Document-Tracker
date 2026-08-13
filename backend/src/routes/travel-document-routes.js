import { Router } from 'express';
import {
  createTravelDocument,
  deleteTravelDocument,
  downloadTravelDocument,
  getTravelDocument,
  listTravelDocuments,
  updateTravelDocument,
} from '../controllers/travel-document-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { documentUpload } from '../middleware/upload.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  createTravelDocumentValidation,
  idValidation,
  updateTravelDocumentValidation,
} from '../validation/document-validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', listTravelDocuments);
router.post('/', documentUpload, createTravelDocumentValidation, validateRequest, createTravelDocument);
router.get('/:id/file', idValidation, validateRequest, downloadTravelDocument);
router.get('/:id', idValidation, validateRequest, getTravelDocument);
router.patch('/:id', documentUpload, idValidation, updateTravelDocumentValidation, validateRequest, updateTravelDocument);
router.delete('/:id', idValidation, validateRequest, deleteTravelDocument);

export default router;

