import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { getConfig } from './env.js';

const config = getConfig();

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: config.nodeEnv === 'development' ? console.log : false,
  dialectOptions: config.databaseSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
});

export async function connectDatabase() {
  await sequelize.authenticate();
  await ensureTask6Columns();
  await ensureTask3Columns();
  await sequelize.sync();
  await ensureTravelDocumentFileMetadata();
  await ensureTask3Indexes();
}

async function ensureTask6Columns() {
  await addMissingColumns('users', [
    [
      'status',
      { type: DataTypes.ENUM('active', 'disabled'), allowNull: false, defaultValue: 'active' },
    ],
  ]);
}

async function tableExists(tableName) {
  const tables = await sequelize.getQueryInterface().showAllTables();
  return tables.some((table) => (typeof table === 'string' ? table : table.tableName) === tableName);
}

async function addMissingColumns(tableName, definitions) {
  if (!(await tableExists(tableName))) return;
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(tableName);
  for (const [column, definition] of definitions) {
    if (!table[column]) await queryInterface.addColumn(tableName, column, definition);
  }
}

async function ensureTask3Columns() {
  await addMissingColumns('reminders', [
    ['enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }],
    ['archived', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
  ]);
  await addMissingColumns('notifications', [
    ['recipient_email', { type: DataTypes.STRING(254), allowNull: true }],
    ['subject', { type: DataTypes.STRING(255), allowNull: true }],
    [
      'document_type',
      { type: DataTypes.ENUM('passport', 'visa', 'travel_document'), allowNull: true },
    ],
    ['document_id', { type: DataTypes.UUID, allowNull: true }],
    ['document_label', { type: DataTypes.STRING(255), allowNull: true }],
    ['threshold_days', { type: DataTypes.INTEGER, allowNull: true }],
    ['expiry_date', { type: DataTypes.DATEONLY, allowNull: true }],
    ['provider_message_id', { type: DataTypes.STRING(255), allowNull: true }],
    ['failure_reason', { type: DataTypes.STRING(1000), allowNull: true }],
  ]);
}

async function ensureIndex(tableName, name, fields, unique = false) {
  if (!(await tableExists(tableName))) return;
  const queryInterface = sequelize.getQueryInterface();
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(tableName, fields, { name, unique });
  }
}

async function ensureTask3Indexes() {
  await ensureIndex(
    'reminders',
    'reminders_document_threshold_unique',
    ['owner_id', 'related_document_type', 'related_document_id', 'days_before'],
    true,
  );
  await ensureIndex(
    'notifications',
    'notifications_reminder_expiry_unique',
    ['related_reminder_id', 'expiry_date'],
    true,
  );
}

async function ensureTravelDocumentFileMetadata() {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('travel_documents');
  const missingColumns = [
    ['original_file_name', { type: DataTypes.STRING(255), allowNull: false }],
    [
      'file_mime_type',
      { type: DataTypes.ENUM('application/pdf', 'image/jpeg', 'image/png'), allowNull: false },
    ],
    ['file_size', { type: DataTypes.INTEGER, allowNull: false }],
  ].filter(([column]) => !table[column]);

  if (missingColumns.length === 0) return;

  const [{ count }] = await sequelize.query('SELECT COUNT(*)::integer AS count FROM travel_documents', {
    type: QueryTypes.SELECT,
  });
  if (count > 0) {
    throw new Error(
      'Cannot add required private-file metadata to existing travel_documents rows. Migrate those rows before starting this version.',
    );
  }

  for (const [column, definition] of missingColumns) {
    await queryInterface.addColumn('travel_documents', column, definition);
  }
}
