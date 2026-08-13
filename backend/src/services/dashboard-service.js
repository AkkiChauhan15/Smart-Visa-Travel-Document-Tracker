import { Op } from 'sequelize';
import { Notification } from '../models/index.js';
import { daysUntilExpiry } from '../utils/expiry-status.js';
import { presentDocuments } from './document-presentation-service.js';
import { DOCUMENT_DEFINITIONS } from './document-registry.js';
import { loadReminderContext } from './reminder-service.js';
import { listOwnedTrips, serializeTrip } from './travel-history-service.js';

const UPCOMING_REMINDER_LIMIT = 5;
const RECENT_TRIP_LIMIT = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function reminderOccurrenceKey(reminderId, expiryDate) {
  return `${reminderId}:${expiryDate}`;
}

function reminderDate(expiryDate, daysBefore) {
  const [year, month, day] = expiryDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - daysBefore * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function countStatuses(documents) {
  const counts = {
    total: documents.length,
    valid: 0,
    expiringSoon: 0,
    expired: 0,
    noExpiry: 0,
  };

  for (const document of documents) {
    if (document.status === 'expiring-soon') counts.expiringSoon += 1;
    else if (document.status === 'no-expiry') counts.noExpiry += 1;
    else if (Object.hasOwn(counts, document.status)) counts[document.status] += 1;
  }
  return counts;
}

function buildComplianceStatus(counts) {
  const common = {
    basis: 'user-stored-data',
    isExternallyVerified: false,
    disclaimer: 'Based only on dates and records you entered. This is not external or government verification.',
  };

  if (counts.total === 0) {
    return {
      ...common,
      code: 'no-data',
      label: 'No documents to assess',
      message: 'Add a passport, visa, or supporting document to see a status summary.',
    };
  }
  if (counts.expired > 0) {
    return {
      ...common,
      code: 'action-needed',
      label: 'Action needed',
      message: `${counts.expired} expired document${counts.expired === 1 ? '' : 's'} ${counts.expired === 1 ? 'needs' : 'need'} attention.`,
    };
  }
  if (counts.expiringSoon > 0) {
    return {
      ...common,
      code: 'action-needed',
      label: 'Action needed',
      message: `${counts.expiringSoon} document${counts.expiringSoon === 1 ? '' : 's'} ${counts.expiringSoon === 1 ? 'is' : 'are'} within ${counts.expiringSoon === 1 ? 'its' : 'their'} reminder window.`,
    };
  }
  if (counts.valid === 0) {
    return {
      ...common,
      code: 'undated',
      label: 'No dated documents to assess',
      message: `${counts.noExpiry} stored document${counts.noExpiry === 1 ? ' has' : 's have'} no expiry date.`,
    };
  }
  return {
    ...common,
    code: 'all-current',
    label: 'All dated documents valid',
    message:
      counts.noExpiry > 0
        ? `${counts.valid} dated document${counts.valid === 1 ? ' is' : 's are'} valid; ${counts.noExpiry} ${counts.noExpiry === 1 ? 'has' : 'have'} no expiry date.`
        : 'No stored document is expired or inside its reminder window.',
  };
}

async function buildUpcomingReminders(ownerId, reminderRows, recordsByKind, now) {
  const documentLookup = new Map();
  const currentExpiryDates = new Set();

  for (const [kind, records] of Object.entries(recordsByKind)) {
    const definition = DOCUMENT_DEFINITIONS[kind];
    for (const record of records) {
      documentLookup.set(`${definition.storageType}:${record.id}`, { kind, definition, record });
      if (record[definition.expiryField]) currentExpiryDates.add(record[definition.expiryField]);
    }
  }
  const reminderIds = reminderRows.map((reminder) => reminder.id);
  const notifications = reminderIds.length && currentExpiryDates.size
    ? await Notification.findAll({
        where: {
          ownerId,
          relatedReminderId: { [Op.in]: reminderIds },
          expiryDate: { [Op.in]: [...currentExpiryDates] },
        },
        order: [['createdAt', 'DESC']],
      })
    : [];
  const notificationsByOccurrence = new Map(
    notifications.map((notification) => [
      reminderOccurrenceKey(notification.relatedReminderId, notification.expiryDate),
      notification,
    ]),
  );

  return reminderRows
    .flatMap((reminder) => {
      if (!reminder.enabled) return [];
      const context = documentLookup.get(`${reminder.relatedDocumentType}:${reminder.relatedDocumentId}`);
      if (!context) return [];
      const expiryDate = context.record[context.definition.expiryField];
      const remaining = daysUntilExpiry(expiryDate, now);
      if (remaining === null || remaining < 0) return [];

      const notification = notificationsByOccurrence.get(reminderOccurrenceKey(reminder.id, expiryDate));
      if (notification?.sentStatus === 'sent') return [];
      const daysUntilReminder = remaining - reminder.daysBefore;
      return [{
        id: reminder.id,
        documentId: context.record.id,
        documentKind: context.kind,
        documentLabel: context.definition.label(context.record),
        thresholdDays: reminder.daysBefore,
        expiryDate,
        reminderDate: reminderDate(expiryDate, reminder.daysBefore),
        daysUntilExpiry: remaining,
        daysUntilReminder,
        isDue: daysUntilReminder <= 0,
        deliveryStatus: notification?.sentStatus ?? 'not-sent',
      }];
    })
    .sort((left, right) =>
      left.daysUntilReminder - right.daysUntilReminder ||
      left.daysUntilExpiry - right.daysUntilExpiry ||
      right.thresholdDays - left.thresholdDays,
    )
    .slice(0, UPCOMING_REMINDER_LIMIT);
}

export async function getDashboardSummary(ownerId, { now = new Date() } = {}) {
  const documentEntries = Object.entries(DOCUMENT_DEFINITIONS);
  const [documentGroups, trips] = await Promise.all([
    Promise.all(
      documentEntries.map(([, definition]) =>
        definition.Model.findAll({
          where: { ownerId },
          order: [['createdAt', 'DESC']],
        }),
      ),
    ),
    listOwnedTrips(ownerId, { limit: RECENT_TRIP_LIMIT }),
  ]);
  const recordsByKind = Object.fromEntries(
    documentEntries.map(([kind], index) => [kind, documentGroups[index]]),
  );
  const reminderRows = await loadReminderContext(ownerId, recordsByKind);
  const presentedGroups = await Promise.all(
    documentEntries.map(([kind]) =>
      presentDocuments(ownerId, kind, recordsByKind[kind], now, reminderRows),
    ),
  );
  const counts = countStatuses(presentedGroups.flat());

  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    complianceStatus: buildComplianceStatus(counts),
    upcomingReminders: await buildUpcomingReminders(ownerId, reminderRows, recordsByKind, now),
    recentTrips: trips.map(serializeTrip),
  };
}
