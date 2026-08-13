import {
  Notification,
  Passport,
  Reminder,
  TravelDocument,
  TravelHistory,
  User,
  Visa,
} from '../models/index.js';
import { calculateExpiryStatus } from '../utils/expiry-status.js';
import { HttpError } from '../utils/http-error.js';

const RECENT_FAILURE_LIMIT = 5;
const ANALYTICS_WEEK_COUNT = 6;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const documentSources = [
  { type: 'passport', responseKey: 'passport', Model: Passport, expiryField: 'expiryDate' },
  { type: 'visa', responseKey: 'visa', Model: Visa, expiryField: 'validUntil' },
  {
    type: 'travel_document',
    responseKey: 'travelDocument',
    Model: TravelDocument,
    expiryField: 'expiryDate',
  },
];

function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(value) {
  const day = startOfUtcDay(value);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * MILLISECONDS_PER_DAY);
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function latestDate(current, candidate) {
  if (!candidate) return current;
  if (!current || new Date(candidate) > new Date(current)) return new Date(candidate).toISOString();
  return current;
}

function emptyActivity() {
  return { documents: 0, trips: 0, notifications: 0, lastActivityAt: null };
}

async function loadActivityRecords() {
  const [passportRows, visaRows, travelDocumentRows, tripRows, notificationRows] = await Promise.all([
    Passport.findAll({ attributes: ['ownerId', 'createdAt'] }),
    Visa.findAll({ attributes: ['ownerId', 'createdAt'] }),
    TravelDocument.findAll({ attributes: ['ownerId', 'createdAt'] }),
    TravelHistory.findAll({ attributes: ['ownerId', 'createdAt'] }),
    Notification.findAll({ attributes: ['ownerId', 'createdAt'] }),
  ]);
  return {
    documents: [...passportRows, ...visaRows, ...travelDocumentRows],
    trips: tripRows,
    notifications: notificationRows,
  };
}

export async function listAdminUsers() {
  const [users, activityRecords] = await Promise.all([
    User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
    }),
    loadActivityRecords(),
  ]);
  const activityByOwner = new Map(users.map((user) => [user.id, emptyActivity()]));

  for (const [kind, records] of Object.entries(activityRecords)) {
    for (const record of records) {
      const activity = activityByOwner.get(record.ownerId);
      if (!activity) continue;
      activity[kind] += 1;
      activity.lastActivityAt = latestDate(activity.lastActivityAt, record.createdAt);
    }
  }

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    joinedAt: user.createdAt,
    activity: activityByOwner.get(user.id),
  }));
}

export async function updateAdminUserStatus(adminId, userId, status) {
  if (adminId === userId && status === 'disabled') {
    throw new HttpError(422, 'Administrators cannot disable their own account');
  }
  const user = await User.findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');
  await user.update({ status });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    joinedAt: user.createdAt,
  };
}

function reminderKey(ownerId, documentType, documentId) {
  return `${ownerId}:${documentType}:${documentId}`;
}

function buildWeeklyUsage(documentRows, tripRows, now) {
  const currentWeek = startOfUtcWeek(now);
  const firstWeek = new Date(
    currentWeek.getTime() - (ANALYTICS_WEEK_COUNT - 1) * 7 * MILLISECONDS_PER_DAY,
  );
  const buckets = new Map();
  for (let index = 0; index < ANALYTICS_WEEK_COUNT; index += 1) {
    const weekStart = new Date(firstWeek.getTime() + index * 7 * MILLISECONDS_PER_DAY);
    buckets.set(dateKey(weekStart), { weekStart: dateKey(weekStart), documentsAdded: 0, tripsLogged: 0 });
  }

  for (const record of documentRows) {
    const bucket = buckets.get(dateKey(startOfUtcWeek(record.createdAt)));
    if (bucket) bucket.documentsAdded += 1;
  }
  for (const trip of tripRows) {
    const bucket = buckets.get(dateKey(startOfUtcWeek(trip.createdAt)));
    if (bucket) bucket.tripsLogged += 1;
  }
  return [...buckets.values()];
}

export async function getAdminStatistics({ now = new Date() } = {}) {
  const documentQueries = documentSources.map((source) =>
    source.Model.findAll({ attributes: ['id', 'ownerId', source.expiryField, 'createdAt'] }),
  );
  const [documentGroups, reminders, notifications, trips, users] = await Promise.all([
    Promise.all(documentQueries),
    Reminder.findAll({
      attributes: [
        'id',
        'ownerId',
        'relatedDocumentType',
        'relatedDocumentId',
        'daysBefore',
        'enabled',
        'archived',
        'status',
      ],
    }),
    Notification.findAll({
      attributes: [
        'id',
        'ownerId',
        'sentStatus',
        'sentDate',
        'channel',
        'documentType',
        'failureReason',
        'createdAt',
        'updatedAt',
      ],
    }),
    TravelHistory.findAll({ attributes: ['ownerId', 'createdAt'] }),
    User.findAll({ attributes: ['id', 'status', 'createdAt'] }),
  ]);

  const reminderDaysByDocument = new Map();
  for (const reminder of reminders) {
    if (!reminder.enabled || reminder.archived) continue;
    const key = reminderKey(reminder.ownerId, reminder.relatedDocumentType, reminder.relatedDocumentId);
    if (!reminderDaysByDocument.has(key)) reminderDaysByDocument.set(key, []);
    reminderDaysByDocument.get(key).push(reminder.daysBefore);
  }

  const documentCounts = { total: 0, passport: 0, visa: 0, travelDocument: 0 };
  const statusCounts = { valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 };
  const allDocumentRows = [];
  for (let index = 0; index < documentSources.length; index += 1) {
    const source = documentSources[index];
    const records = documentGroups[index];
    documentCounts[source.responseKey] = records.length;
    documentCounts.total += records.length;
    for (const record of records) {
      const status = calculateExpiryStatus(
        record[source.expiryField],
        reminderDaysByDocument.get(reminderKey(record.ownerId, source.type, record.id)) ?? [],
        now,
      ).status;
      if (status === 'expiring-soon') statusCounts.expiringSoon += 1;
      else if (status === 'no-expiry') statusCounts.noExpiry += 1;
      else statusCounts[status] += 1;
      allDocumentRows.push({
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        expiryDate: record[source.expiryField],
      });
    }
  }

  const notificationCounts = { total: notifications.length, sent: 0, failed: 0, pending: 0 };
  for (const notification of notifications) notificationCounts[notification.sentStatus] += 1;
  const recentFailures = notifications
    .filter((notification) => notification.sentStatus === 'failed')
    .sort((left, right) =>
      new Date(right.sentDate ?? right.updatedAt) - new Date(left.sentDate ?? left.updatedAt),
    )
    .slice(0, RECENT_FAILURE_LIMIT)
    .map((notification) => ({
      id: notification.id,
      status: notification.sentStatus,
      failedAt: notification.sentDate ?? notification.updatedAt,
      channel: notification.channel,
      documentType: notification.documentType,
      failureReason: notification.failureReason ?? 'No failure reason was recorded',
    }));

  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + MILLISECONDS_PER_DAY);
  const currentWeekStart = startOfUtcWeek(now);
  const elapsedWeekDays = Math.round((tomorrow - currentWeekStart) / MILLISECONDS_PER_DAY);
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * MILLISECONDS_PER_DAY);
  const previousWeekComparableEnd = new Date(
    previousWeekStart.getTime() + elapsedWeekDays * MILLISECONDS_PER_DAY,
  );
  const expiryDates = allDocumentRows.map((record) => record.expiryDate).filter(Boolean);
  const expiredThisWeekToDate = expiryDates.filter(
    (expiryDate) => expiryDate >= dateKey(currentWeekStart) && expiryDate < dateKey(tomorrow),
  ).length;
  const expiredPreviousWeekSamePeriod = expiryDates.filter(
    (expiryDate) =>
      expiryDate >= dateKey(previousWeekStart) && expiryDate < dateKey(previousWeekComparableEnd),
  ).length;

  const activityCutoff = new Date(new Date(now).getTime() - 30 * MILLISECONDS_PER_DAY);
  const recentlyActiveOwnerIds = new Set(
    [...allDocumentRows, ...trips]
      .filter((record) => new Date(record.createdAt) >= activityCutoff)
      .map((record) => record.ownerId),
  );
  const enabledUserIds = new Set(users.filter((user) => user.status === 'active').map((user) => user.id));

  return {
    generatedAt: new Date(now).toISOString(),
    documents: {
      byType: documentCounts,
      byStatus: statusCounts,
    },
    reminders: {
      active: reminders.filter(
        (reminder) => reminder.enabled && !reminder.archived && reminder.status === 'active',
      ).length,
    },
    notifications: {
      counts: notificationCounts,
      recentFailures,
    },
    compliance: {
      expiringSoon: statusCounts.expiringSoon,
      expired: statusCounts.expired,
      expiredThisWeekToDate,
      expiredPreviousWeekSamePeriod,
      changeFromPreviousComparablePeriod:
        expiredThisWeekToDate - expiredPreviousWeekSamePeriod,
      basis: 'aggregate-user-stored-data',
      isExternallyVerified: false,
      disclaimer:
        'Aggregate status is based only on dates stored by users. It is not external or government verification.',
    },
    usage: {
      totalUsers: users.length,
      enabledAccounts: enabledUserIds.size,
      disabledAccounts: users.length - enabledUserIds.size,
      activeUsersLast30Days: [...recentlyActiveOwnerIds].filter((id) => enabledUserIds.has(id)).length,
      activeUserDefinition:
        'Enabled accounts that added a document or logged a trip in the last 30 days.',
      newUsersThisWeek: users.filter((user) => new Date(user.createdAt) >= currentWeekStart).length,
      weeklyActivity: buildWeeklyUsage(allDocumentRows, trips, now),
    },
  };
}
