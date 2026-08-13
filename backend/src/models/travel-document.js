import { DataTypes } from 'sequelize';

export function defineTravelDocument(sequelize) {
  return sequelize.define(
    'TravelDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      documentType: {
        type: DataTypes.STRING(80),
        allowNull: false,
        field: 'document_type',
        validate: { notEmpty: true },
      },
      fileReference: {
        type: DataTypes.STRING(500),
        allowNull: false,
        field: 'file_reference',
        validate: { notEmpty: true },
      },
      originalFileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'original_file_name',
        validate: { notEmpty: true },
      },
      fileMimeType: {
        type: DataTypes.ENUM('application/pdf', 'image/jpeg', 'image/png'),
        allowNull: false,
        field: 'file_mime_type',
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'file_size',
        validate: { min: 1, isInt: true },
      },
      uploadDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'upload_date' },
      expiryDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'expiry_date', validate: { isDate: true } },
    },
    { tableName: 'travel_documents' },
  );
}
