import { DataTypes } from 'sequelize';

export function defineNotification(sequelize) {
  return sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      relatedReminderId: { type: DataTypes.UUID, allowNull: false, field: 'related_reminder_id' },
      sentStatus: {
        type: DataTypes.ENUM('pending', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
        field: 'sent_status',
      },
      sentDate: { type: DataTypes.DATE, allowNull: true, field: 'sent_date' },
      channel: { type: DataTypes.ENUM('email'), allowNull: false, defaultValue: 'email' },
      recipientEmail: {
        type: DataTypes.STRING(254),
        allowNull: false,
        field: 'recipient_email',
        validate: { isEmail: true },
      },
      subject: { type: DataTypes.STRING(255), allowNull: false, validate: { notEmpty: true } },
      documentType: {
        type: DataTypes.ENUM('passport', 'visa', 'travel_document'),
        allowNull: false,
        field: 'document_type',
      },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      documentLabel: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'document_label',
        validate: { notEmpty: true },
      },
      thresholdDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'threshold_days',
        validate: { min: 0, max: 3650, isInt: true },
      },
      expiryDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'expiry_date',
        validate: { isDate: true },
      },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true, field: 'provider_message_id' },
      failureReason: { type: DataTypes.STRING(1000), allowNull: true, field: 'failure_reason' },
    },
    {
      tableName: 'notifications',
      indexes: [
        { fields: ['owner_id', 'sent_status'] },
        {
          unique: true,
          name: 'notifications_reminder_expiry_unique',
          fields: ['related_reminder_id', 'expiry_date'],
        },
      ],
    },
  );
}
