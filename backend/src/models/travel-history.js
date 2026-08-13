import { DataTypes } from 'sequelize';

export function defineTravelHistory(sequelize) {
  return sequelize.define(
    'TravelHistory',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
      countryVisited: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'country_visited',
        validate: { notEmpty: true },
      },
      entryDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'entry_date', validate: { isDate: true } },
      exitDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'exit_date', validate: { isDate: true } },
      purpose: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
      visaUsedId: { type: DataTypes.UUID, allowNull: true, field: 'visa_used_id' },
    },
    {
      tableName: 'travel_history',
      validate: {
        visitDatesAreOrdered() {
          if (this.entryDate && this.exitDate && this.exitDate < this.entryDate) {
            throw new Error('Travel exit date cannot be before entry date');
          }
        },
      },
    },
  );
}

