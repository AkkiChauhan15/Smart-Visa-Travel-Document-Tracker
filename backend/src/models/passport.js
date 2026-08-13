import { DataTypes } from 'sequelize';

export function definePassport(sequelize) {
  return sequelize.define(
    'Passport',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      passportNumber: {
        type: DataTypes.STRING(30),
        allowNull: false,
        field: 'passport_number',
        validate: { notEmpty: true, len: [3, 30] },
      },
      countryOfIssue: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'country_of_issue',
        validate: { notEmpty: true },
      },
      issueDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'issue_date', validate: { isDate: true } },
      expiryDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'expiry_date', validate: { isDate: true } },
    },
    {
      tableName: 'passports',
      indexes: [{ unique: true, fields: ['country_of_issue', 'passport_number'] }],
      validate: {
        expiryAfterIssue() {
          if (this.issueDate && this.expiryDate && this.expiryDate <= this.issueDate) {
            throw new Error('Passport expiry date must be after its issue date');
          }
        },
      },
    },
  );
}

