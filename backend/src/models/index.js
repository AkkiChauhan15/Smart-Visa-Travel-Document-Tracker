import { sequelize } from '../config/database.js';
import { defineDestinationChecklist } from './destination-checklist.js';
import { defineNotification } from './notification.js';
import { definePassport } from './passport.js';
import { defineReminder } from './reminder.js';
import { defineTravelDocument } from './travel-document.js';
import { defineTravelHistory } from './travel-history.js';
import { defineUser } from './user.js';
import { defineVisa } from './visa.js';

export const User = defineUser(sequelize);
export const Passport = definePassport(sequelize);
export const Visa = defineVisa(sequelize);
export const TravelDocument = defineTravelDocument(sequelize);
export const TravelHistory = defineTravelHistory(sequelize);
export const Reminder = defineReminder(sequelize);
export const Notification = defineNotification(sequelize);
export const DestinationChecklist = defineDestinationChecklist(sequelize);

User.hasMany(Passport, { foreignKey: 'ownerId', as: 'passports', onDelete: 'CASCADE' });
Passport.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(Visa, { foreignKey: 'ownerId', as: 'visas', onDelete: 'CASCADE' });
Visa.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(TravelDocument, { foreignKey: 'ownerId', as: 'travelDocuments', onDelete: 'CASCADE' });
TravelDocument.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(TravelHistory, { foreignKey: 'ownerId', as: 'travelHistory', onDelete: 'CASCADE' });
TravelHistory.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
Visa.hasMany(TravelHistory, { foreignKey: 'visaUsedId', as: 'travelHistory', onDelete: 'SET NULL' });
TravelHistory.belongsTo(Visa, { foreignKey: 'visaUsedId', as: 'visaUsed' });

User.hasMany(Reminder, { foreignKey: 'ownerId', as: 'reminders', onDelete: 'CASCADE' });
Reminder.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(Notification, { foreignKey: 'ownerId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
Reminder.hasMany(Notification, { foreignKey: 'relatedReminderId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(Reminder, { foreignKey: 'relatedReminderId', as: 'relatedReminder' });

// A reminder can point to one of three document tables. Constraints are disabled
// here because PostgreSQL cannot express a polymorphic foreign key; services must
// query by both ownerId and relatedDocumentId when document CRUD is added.
Reminder.belongsTo(Passport, { foreignKey: 'relatedDocumentId', constraints: false, as: 'passport' });
Reminder.belongsTo(Visa, { foreignKey: 'relatedDocumentId', constraints: false, as: 'visa' });
Reminder.belongsTo(TravelDocument, {
  foreignKey: 'relatedDocumentId',
  constraints: false,
  as: 'travelDocument',
});

export { sequelize };

