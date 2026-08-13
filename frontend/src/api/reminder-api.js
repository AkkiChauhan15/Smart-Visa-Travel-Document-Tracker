import { apiRequest } from './client.js';

export async function listReminderSettings() {
  const data = await apiRequest('/reminders');
  return data.reminderSettings;
}

export async function saveReminderSettings(kind, documentId, reminders) {
  const data = await apiRequest(`/reminders/${kind}/${documentId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminders }),
  });
  return data.reminderSetting;
}

export async function listNotifications() {
  const data = await apiRequest('/notifications');
  return data.notifications;
}

