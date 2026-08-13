import { DataTypes } from 'sequelize';

export const STATIC_REFERENCE_DISCLAIMER =
  'Static reference data only. Requirements vary by country and must be verified with official authorities.';

export function defineDestinationChecklist(sequelize) {
  return sequelize.define(
    'DestinationChecklist',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      destinationCountry: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        field: 'destination_country',
        validate: { notEmpty: true },
      },
      checklistItems: {
        type: DataTypes.JSONB,
        allowNull: false,
        field: 'checklist_items',
        defaultValue: [],
        validate: {
          isStringArray(value) {
            if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
              throw new Error('Checklist items must be an array of non-empty strings');
            }
          },
        },
      },
      isStaticReference: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_static_reference',
        validate: { isTrue(value) { if (value !== true) throw new Error('Destination checklists must remain static reference data'); } },
      },
      disclaimer: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: STATIC_REFERENCE_DISCLAIMER,
      },
    },
    { tableName: 'destination_checklists' },
  );
}
