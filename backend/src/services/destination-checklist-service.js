import { DestinationChecklist } from '../models/index.js';
import { STATIC_REFERENCE_DISCLAIMER } from '../models/destination-checklist.js';
import { HttpError } from '../utils/http-error.js';

export const DESTINATION_CHECKLIST_SEEDS = Object.freeze([
  {
    destinationCountry: 'France',
    checklistItems: [
      'Check passport validity and blank-page guidance published by French authorities.',
      'Confirm whether a Schengen visa or visa exemption applies to your nationality and trip.',
      'Carry accommodation details and evidence of onward or return travel if officially required.',
      'Check current travel medical insurance requirements with official authorities.',
    ],
  },
  {
    destinationCountry: 'Japan',
    checklistItems: [
      'Check passport validity guidance published by Japanese authorities.',
      'Confirm whether a visa or visa exemption applies to your nationality and purpose of travel.',
      'Keep accommodation and onward or return travel details available if officially requested.',
      'Review current customs, medication, and arrival-procedure rules on official websites.',
    ],
  },
  {
    destinationCountry: 'Singapore',
    checklistItems: [
      'Check passport validity guidance published by Singapore authorities.',
      'Confirm whether an entry visa applies to your travel document and nationality.',
      'Review the current electronic arrival declaration process on the official immigration site.',
      'Keep onward travel and accommodation details available if officially required.',
    ],
  },
  {
    destinationCountry: 'United Arab Emirates',
    checklistItems: [
      'Check passport validity guidance published by UAE authorities and your carrier.',
      'Confirm whether a pre-arranged visa or visa-on-arrival provision applies to your nationality.',
      'Keep accommodation and onward or return travel details available if officially requested.',
      'Review current medication and customs restrictions using official sources.',
    ],
  },
  {
    destinationCountry: 'United States',
    checklistItems: [
      'Check passport validity guidance and passport-program eligibility with US authorities.',
      'Confirm whether you need a visa or current authorization under the Visa Waiver Program.',
      'Carry details supporting your stated trip purpose, accommodation, and onward travel if requested.',
      'Review current customs, medication, and entry requirements on official government websites.',
    ],
  },
]);

export const REFERENCE_NOTICE = Object.freeze({
  isStaticReference: true,
  isLiveVerified: false,
  disclaimer: STATIC_REFERENCE_DISCLAIMER,
});

export async function seedDestinationChecklists() {
  for (const entry of DESTINATION_CHECKLIST_SEEDS) {
    await DestinationChecklist.upsert({
      ...entry,
      isStaticReference: true,
      disclaimer: STATIC_REFERENCE_DISCLAIMER,
    });
  }
}

export function serializeDestinationChecklist(checklist) {
  return {
    id: checklist.id,
    destinationCountry: checklist.destinationCountry,
    checklistItems: checklist.checklistItems,
    ...REFERENCE_NOTICE,
    updatedAt: checklist.updatedAt,
  };
}

export async function listDestinationChecklists() {
  return DestinationChecklist.findAll({ order: [['destinationCountry', 'ASC']] });
}

export async function findDestinationChecklist(id) {
  const checklist = await DestinationChecklist.findByPk(id);
  if (!checklist) throw new HttpError(404, 'Destination checklist not found');
  return checklist;
}

