import { Notification } from '../models/index.js';

function serializeNotification(notification) {
  return {
    id: notification.id,
    reminderId: notification.relatedReminderId,
    documentType: notification.documentType?.replace('_', '-') ?? null,
    documentId: notification.documentId,
    documentLabel: notification.documentLabel,
    thresholdDays: notification.thresholdDays,
    expiryDate: notification.expiryDate,
    recipientEmail: notification.recipientEmail,
    sentStatus: notification.sentStatus,
    sentDate: notification.sentDate,
    channel: notification.channel,
    failureReason: notification.failureReason,
    createdAt: notification.createdAt,
  };
}

export async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.findAll({
      where: { ownerId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    res.json({ notifications: notifications.map(serializeNotification) });
  } catch (error) {
    next(error);
  }
}
