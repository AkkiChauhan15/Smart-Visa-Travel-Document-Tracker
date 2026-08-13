import { useAuth } from '../auth/AuthContext.jsx';
import AppShell from '../components/AppShell.jsx';

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <main className="account-page">
        <section className="account-card">
        <p className="eyebrow">Protected account</p>
        <h1>Welcome, {user.name}</h1>
        <p>Your authenticated session is active.</p>
        <dl>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd>{user.role}</dd></div>
        </dl>
        </section>
      </main>
    </AppShell>
  );
}
