import { DataTypes } from 'sequelize';

export function defineReminder(sequelize) {
  return sequelize.define(
    'Reminder',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      relatedDocumentType: {
        type: DataTypes.ENUM('passport', 'visa', 'travel_document'),
        allowNull: false,
        field: 'related_document_type',
      },
      relatedDocumentId: { type: DataTypes.UUID, allowNull: false, field: 'related_document_id' },
      daysBefore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'days_before',
        validate: { min: 0, max: 3650, isInt: true },
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      archived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM('active', 'triggered', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      tableName: 'reminders',
      indexes: [
        { fields: ['owner_id', 'status'] },
        {
          unique: true,
          name: 'reminders_document_threshold_unique',
          fields: ['owner_id', 'related_document_type', 'related_document_id', 'days_before'],
        },
      ],
    },
  );
}
