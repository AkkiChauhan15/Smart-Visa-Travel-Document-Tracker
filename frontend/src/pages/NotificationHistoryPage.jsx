import { useEffect, useState } from 'react';
import { listNotifications } from '../api/reminder-api.js';
import AppShell from '../components/AppShell.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationHistoryPage() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listNotifications()
      .then(setNotifications)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AppShell>
      <main className="content-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Delivery log</p>
            <h1>Notification history</h1>
            <p>Email reminders sent—or attempted—for your documents.</p>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading notification history…</p>}
        {!isLoading && notifications.length === 0 && <p className="empty-state">No reminder emails have been attempted yet.</p>}
        {notifications.length > 0 && (
          <div className="table-scroll">
            <table className="notification-table">
              <thead><tr><th>Document</th><th>Reminder</th><th>Status</th><th>Attempted</th><th>Recipient</th></tr></thead>
              <tbody>
                {notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td><strong>{notification.documentLabel}</strong><small>Expires {notification.expiryDate}</small></td>
                    <td>{notification.thresholdDays} days before</td>
                    <td>
                      <span className={`delivery-badge delivery-${notification.sentStatus}`}>{notification.sentStatus}</span>
                      {notification.failureReason && <small title={notification.failureReason}>{notification.failureReason}</small>}
                    </td>
                    <td>{formatDate(notification.sentDate ?? notification.createdAt)}</td>
                    <td>{notification.recipientEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}

