import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/dashboard">Smart Visa Tracker</NavLink>
        <nav aria-label="Main navigation">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/travel-history">Trips</NavLink>
          <NavLink to="/destinations">Destinations</NavLink>
          <NavLink to="/reminders">Reminders</NavLink>
          <NavLink to="/notifications">Notifications</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          <NavLink to="/account">Account</NavLink>
          <button className="text-button" type="button" onClick={handleLogout}>Sign out</button>
        </nav>
      </header>
      {children}
    </div>
  );
}
