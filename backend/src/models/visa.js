import { DataTypes } from 'sequelize';

export function defineVisa(sequelize) {
  return sequelize.define(
    'Visa',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      country: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
      visaType: { type: DataTypes.STRING(80), allowNull: false, field: 'visa_type', validate: { notEmpty: true } },
      validFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'valid_from', validate: { isDate: true } },
      validUntil: { type: DataTypes.DATEONLY, allowNull: false, field: 'valid_until', validate: { isDate: true } },
      entryType: {
        type: DataTypes.ENUM('single', 'multiple'),
        allowNull: false,
        field: 'entry_type',
      },
      visaId: { type: DataTypes.STRING(80), allowNull: false, field: 'visa_id', validate: { notEmpty: true } },
    },
    {
      tableName: 'visas',
      indexes: [{ unique: true, fields: ['owner_id', 'visa_id'] }],
      validate: {
        validityDatesAreOrdered() {
          if (this.validFrom && this.validUntil && this.validUntil < this.validFrom) {
            throw new Error('Visa valid-until date cannot be before valid-from date');
          }
        },
      },
    },
  );
}

