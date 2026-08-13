import {
  findDestinationChecklist,
  listDestinationChecklists,
  REFERENCE_NOTICE,
  serializeDestinationChecklist,
} from '../services/destination-checklist-service.js';

export async function listChecklists(_req, res, next) {
  try {
    const checklists = await listDestinationChecklists();
    res.json({
      referenceNotice: REFERENCE_NOTICE,
      destinationChecklists: checklists.map(serializeDestinationChecklist),
    });
  } catch (error) {
    next(error);
  }
}

export async function getChecklist(req, res, next) {
  try {
    const checklist = await findDestinationChecklist(req.params.id);
    res.json({
      referenceNotice: REFERENCE_NOTICE,
      destinationChecklist: serializeDestinationChecklist(checklist),
    });
  } catch (error) {
    next(error);
  }
}

