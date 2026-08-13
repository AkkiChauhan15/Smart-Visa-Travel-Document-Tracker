import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../api/dashboard-api.js';
import AppShell from '../components/AppShell.jsx';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function reminderTiming(reminder) {
  if (reminder.daysUntilReminder === 0) return 'Due today';
  if (reminder.daysUntilReminder < 0) {
    const days = Math.abs(reminder.daysUntilReminder);
    return `Due ${days} day${days === 1 ? '' : 's'} ago`;
  }
  return `In ${reminder.daysUntilReminder} day${reminder.daysUntilReminder === 1 ? '' : 's'}`;
}

function expiryTiming(days) {
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

const metricCards = [
  { key: 'total', label: 'Total documents', note: 'All stored document types' },
  { key: 'valid', label: 'Valid', note: 'Outside reminder windows' },
  { key: 'expiringSoon', label: 'Expiring soon', note: 'Inside reminder windows' },
  { key: 'expired', label: 'Expired', note: 'Past their expiry date' },
];

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setDashboard)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AppShell>
      <main className="content-page dashboard-page">
        <div className="page-heading dashboard-heading">
          <div>
            <p className="eyebrow">At a glance</p>
            <h1>Dashboard</h1>
            <p>A live summary of the travel records saved in your account.</p>
          </div>
          <Link className="primary-link" to="/documents/new">Add document</Link>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading your dashboard…</p>}

        {dashboard && (
          <>
            <section
              className={`compliance-banner compliance-${dashboard.complianceStatus.code}`}
              aria-labelledby="compliance-title"
              data-compliance-status={dashboard.complianceStatus.code}
            >
              <div className="compliance-symbol" aria-hidden="true">
                {dashboard.complianceStatus.code === 'all-current' ? '✓' : '!'}
              </div>
              <div>
                <p className="eyebrow">Current compliance status</p>
                <h2 id="compliance-title">{dashboard.complianceStatus.label}</h2>
                <p>{dashboard.complianceStatus.message}</p>
                <small>{dashboard.complianceStatus.disclaimer}</small>
              </div>
            </section>

            <section className="metric-grid" aria-label="Document status summary">
              {metricCards.map((metric) => (
                <article className={`metric-card metric-${metric.key}`} key={metric.key}>
                  <span>{metric.label}</span>
                  <strong data-metric={metric.key}>{dashboard.counts[metric.key]}</strong>
                  <small>{metric.note}</small>
                </article>
              ))}
            </section>
            {dashboard.counts.noExpiry > 0 && (
              <p className="undated-note">
                {dashboard.counts.noExpiry} supporting document{dashboard.counts.noExpiry === 1 ? '' : 's'} {dashboard.counts.noExpiry === 1 ? 'has' : 'have'} no expiry date and {dashboard.counts.noExpiry === 1 ? 'is' : 'are'} included only in the total.
              </p>
            )}

            <div className="dashboard-sections">
              <section className="dashboard-panel" aria-labelledby="upcoming-reminders-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Next up</p>
                    <h2 id="upcoming-reminders-heading">Upcoming reminders</h2>
                  </div>
                  <Link to="/reminders">Manage</Link>
                </div>
                {dashboard.upcomingReminders.length === 0 ? (
                  <div className="dashboard-empty">
                    <h3>No upcoming reminders</h3>
                    <p>Add a dated document or enable a reminder threshold.</p>
                  </div>
                ) : (
                  <div className="dashboard-list" data-dashboard-list="reminders">
                    {dashboard.upcomingReminders.map((reminder) => (
                      <article className="dashboard-list-row" key={reminder.id}>
                        <div>
                          <Link to={`/documents/${reminder.documentKind}/${reminder.documentId}/edit`}>
                            {reminder.documentLabel}
                          </Link>
                          <small>
                            {reminder.thresholdDays} days before · {expiryTiming(reminder.daysUntilExpiry)}
                          </small>
                        </div>
                        <div className="reminder-due">
                          <strong>{reminderTiming(reminder)}</strong>
                          <small>{formatDate(reminder.reminderDate)}</small>
                          {reminder.deliveryStatus === 'failed' && (
                            <span className="delivery-badge delivery-failed">Send failed</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="dashboard-panel" aria-labelledby="recent-trips-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Journey log</p>
                    <h2 id="recent-trips-heading">Recent trips</h2>
                  </div>
                  <Link to="/travel-history">View all</Link>
                </div>
                {dashboard.recentTrips.length === 0 ? (
                  <div className="dashboard-empty">
                    <h3>No trips logged yet</h3>
                    <p>Your most recent journeys will appear here.</p>
                    <Link to="/travel-history/new">Log a trip</Link>
                  </div>
                ) : (
                  <div className="dashboard-list" data-dashboard-list="trips">
                    {dashboard.recentTrips.map((trip) => (
                      <article className="dashboard-list-row trip-summary-row" key={trip.id}>
                        <div>
                          <Link to={`/travel-history/${trip.id}/edit`}>{trip.countryVisited}</Link>
                          <small>{trip.purpose}</small>
                        </div>
                        <div>
                          <strong>{formatDate(trip.entryDate)}</strong>
                          <small>to {formatDate(trip.exitDate)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
