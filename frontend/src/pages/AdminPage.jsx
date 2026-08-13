import { useEffect, useState } from 'react';
import { getAdminStatistics, listAdminUsers, updateAdminUserStatus } from '../api/admin-api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AppShell from '../components/AppShell.jsx';

function formatDate(value) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: value.includes?.('T') ? 'short' : undefined,
    timeZone: 'UTC',
  }).format(new Date(value));
}

function documentTypeLabel(value) {
  return {
    passport: 'Passport',
    visa: 'Visa',
    travel_document: 'Supporting document',
  }[value] ?? 'Document';
}

const statisticCards = [
  { path: ['usage', 'totalUsers'], label: 'Total users', note: 'Registered accounts' },
  { path: ['documents', 'byType', 'total'], label: 'Documents', note: 'Across all document types' },
  { path: ['reminders', 'active'], label: 'Active reminders', note: 'Enabled and awaiting delivery' },
  { path: ['notifications', 'counts', 'failed'], label: 'Failed emails', note: 'Delivery failures recorded' },
];

function readPath(value, path) {
  return path.reduce((current, key) => current[key], value);
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listAdminUsers(), getAdminStatistics()])
      .then(([userRows, statisticData]) => {
        setUsers(userRows);
        setStatistics(statisticData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  async function changeStatus(user) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    const action = nextStatus === 'disabled' ? 'disable' : 'enable';
    if (!window.confirm(`Are you sure you want to ${action} ${user.name}'s account?`)) return;

    setError('');
    setUpdatingUserId(user.id);
    try {
      const updated = await updateAdminUserStatus(user.id, nextStatus);
      const refreshedStatistics = await getAdminStatistics();
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, ...updated } : item)),
      );
      setStatistics(refreshedStatistics);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <AppShell>
      <main className="content-page admin-page">
        <div className="page-heading admin-heading">
          <div>
            <p className="eyebrow">Restricted access</p>
            <h1>Admin panel</h1>
            <p>Account management and aggregate operational health across the platform.</p>
          </div>
          <span className="admin-access-badge">Admin only</span>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {isLoading && <p className="empty-state" role="status">Loading admin data…</p>}

        {statistics && (
          <>
            <section className="metric-grid admin-metric-grid" aria-label="Platform summary">
              {statisticCards.map((card) => (
                <article className="metric-card admin-metric-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong data-admin-metric={card.path.at(-1)}>{readPath(statistics, card.path)}</strong>
                  <small>{card.note}</small>
                </article>
              ))}
            </section>

            <section className="admin-compliance-panel" aria-labelledby="admin-compliance-heading">
              <div>
                <p className="eyebrow">Aggregate compliance</p>
                <h2 id="admin-compliance-heading">Stored document status</h2>
                <p>{statistics.compliance.disclaimer}</p>
              </div>
              <dl className="admin-compliance-counts">
                <div><dt>Valid</dt><dd>{statistics.documents.byStatus.valid}</dd></div>
                <div><dt>Expiring soon</dt><dd>{statistics.compliance.expiringSoon}</dd></div>
                <div><dt>Expired</dt><dd>{statistics.compliance.expired}</dd></div>
                <div><dt>No expiry</dt><dd>{statistics.documents.byStatus.noExpiry}</dd></div>
              </dl>
              <p className="trend-note">
                Expired this week to date: <strong>{statistics.compliance.expiredThisWeekToDate}</strong>
                {' · '}Comparable days last week: <strong>{statistics.compliance.expiredPreviousWeekSamePeriod}</strong>
                {' · '}Change: <strong>{statistics.compliance.changeFromPreviousComparablePeriod >= 0 ? '+' : ''}{statistics.compliance.changeFromPreviousComparablePeriod}</strong>
              </p>
            </section>

            <div className="admin-summary-grid">
              <section className="dashboard-panel" aria-labelledby="document-totals-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Inventory</p>
                    <h2 id="document-totals-heading">Documents by type</h2>
                  </div>
                </div>
                <dl className="admin-definition-list">
                  <div><dt>Passports</dt><dd>{statistics.documents.byType.passport}</dd></div>
                  <div><dt>Visas</dt><dd>{statistics.documents.byType.visa}</dd></div>
                  <div><dt>Supporting documents</dt><dd>{statistics.documents.byType.travelDocument}</dd></div>
                </dl>
              </section>

              <section className="dashboard-panel" aria-labelledby="account-health-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Usage</p>
                    <h2 id="account-health-heading">Account health</h2>
                  </div>
                </div>
                <dl className="admin-definition-list">
                  <div><dt>Enabled accounts</dt><dd>{statistics.usage.enabledAccounts}</dd></div>
                  <div><dt>Disabled accounts</dt><dd>{statistics.usage.disabledAccounts}</dd></div>
                  <div><dt>Active in 30 days</dt><dd>{statistics.usage.activeUsersLast30Days}</dd></div>
                  <div><dt>New this week</dt><dd>{statistics.usage.newUsersThisWeek}</dd></div>
                </dl>
                <p className="definition-note">{statistics.usage.activeUserDefinition}</p>
              </section>
            </div>

            <section className="admin-section" aria-labelledby="weekly-activity-heading">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Six-week view</p>
                  <h2 id="weekly-activity-heading">Usage activity</h2>
                </div>
              </div>
              <div className="table-scroll">
                <table className="admin-table compact-admin-table">
                  <thead><tr><th>Week starting</th><th>Documents added</th><th>Trips logged</th></tr></thead>
                  <tbody>
                    {statistics.usage.weeklyActivity.map((week) => (
                      <tr key={week.weekStart}>
                        <td>{formatDate(`${week.weekStart}T00:00:00.000Z`)}</td>
                        <td>{week.documentsAdded}</td>
                        <td>{week.tripsLogged}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-section" aria-labelledby="notification-health-heading">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Email delivery</p>
                  <h2 id="notification-health-heading">Notification monitoring</h2>
                </div>
                <span className="notification-count-summary">
                  {statistics.notifications.counts.sent} sent · {statistics.notifications.counts.failed} failed · {statistics.notifications.counts.pending} pending
                </span>
              </div>
              {statistics.notifications.recentFailures.length === 0 ? (
                <div className="dashboard-empty"><h3>No recent failures</h3><p>Email failures will appear here without message contents.</p></div>
              ) : (
                <div className="table-scroll">
                  <table className="admin-table">
                    <thead><tr><th>Failed at</th><th>Channel</th><th>Document type</th><th>Operational error</th></tr></thead>
                    <tbody>
                      {statistics.notifications.recentFailures.map((failure) => (
                        <tr key={failure.id}>
                          <td>{formatDate(failure.failedAt)}</td>
                          <td>{failure.channel}</td>
                          <td>{documentTypeLabel(failure.documentType)}</td>
                          <td className="failure-reason">{failure.failureReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {!isLoading && (
          <section className="admin-section" aria-labelledby="user-management-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Accounts</p>
                <h2 id="user-management-heading">User management</h2>
              </div>
              <span>{users.length} users</span>
            </div>
            {users.length === 0 ? (
              <div className="dashboard-empty"><h3>No users found</h3></div>
            ) : (
              <div className="table-scroll">
                <table className="admin-table" data-admin-table="users">
                  <thead>
                    <tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Activity</th><th>Last activity</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} data-user-id={user.id}>
                        <td><strong>{user.name}</strong><small>{user.email}</small></td>
                        <td><span className="role-badge">{user.role}</span></td>
                        <td><span className={`account-status status-${user.status}`}>{user.status}</span></td>
                        <td>{formatDate(user.joinedAt)}</td>
                        <td>{user.activity.documents} docs · {user.activity.trips} trips · {user.activity.notifications} notices</td>
                        <td>{formatDate(user.activity.lastActivityAt)}</td>
                        <td>
                          <button
                            className={user.status === 'active' ? 'disable-account-button' : 'enable-account-button'}
                            type="button"
                            disabled={updatingUserId === user.id || user.id === currentUser.id}
                            title={user.id === currentUser.id ? 'You cannot disable your own account' : undefined}
                            onClick={() => changeStatus(user)}
                          >
                            {updatingUserId === user.id
                              ? 'Saving…'
                              : user.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
