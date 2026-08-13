import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DataTypes } from 'sequelize';

const { connectDatabase, sequelize } = await import('../src/config/database.js');
const { getConfig } = await import('../src/config/env.js');
await import('../src/models/index.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

describe('Task 1 schema upgrade', () => {
  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.dropTable('notifications', { cascade: true });
    await queryInterface.dropTable('reminders', { cascade: true });
    await queryInterface.dropTable('travel_documents', { cascade: true });
    await queryInterface.createTable('travel_documents', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      document_type: { type: DataTypes.STRING(80), allowNull: false },
      file_reference: { type: DataTypes.STRING(500), allowNull: false },
      upload_date: { type: DataTypes.DATE, allowNull: false },
      expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.createTable('reminders', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      related_document_type: { type: DataTypes.STRING(30), allowNull: false },
      related_document_id: { type: DataTypes.UUID, allowNull: false },
      days_before: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(30), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.createTable('notifications', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      related_reminder_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'reminders', key: 'id' },
        onDelete: 'CASCADE',
      },
      sent_status: { type: DataTypes.STRING(30), allowNull: false },
      sent_date: { type: DataTypes.DATE, allowNull: true },
      channel: { type: DataTypes.STRING(30), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
  });

  after(async () => {
    await sequelize.close();
  });

  it('adds required private-file metadata to an empty Task 1 table', async () => {
    await connectDatabase();
    const table = await sequelize.getQueryInterface().describeTable('travel_documents');
    assert.equal(table.original_file_name.allowNull, false);
    assert.equal(table.file_mime_type.allowNull, false);
    assert.equal(table.file_size.allowNull, false);

    const userTable = await sequelize.getQueryInterface().describeTable('users');
    assert.equal(userTable.status.allowNull, false);

    const reminderTable = await sequelize.getQueryInterface().describeTable('reminders');
    assert.equal(reminderTable.enabled.allowNull, false);
    assert.equal(reminderTable.archived.allowNull, false);

    const notificationTable = await sequelize.getQueryInterface().describeTable('notifications');
    for (const column of ['recipient_email', 'subject', 'document_type', 'document_id', 'document_label', 'threshold_days', 'expiry_date', 'provider_message_id', 'failure_reason']) {
      assert.ok(notificationTable[column], `expected notifications.${column}`);
    }
  });
});
