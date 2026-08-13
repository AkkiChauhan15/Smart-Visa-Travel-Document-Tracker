import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';

const initialForm = { name: '', email: '', password: '', confirmPassword: '' };

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.details) {
        setFieldErrors(
          Object.fromEntries(requestError.details.map((item) => [item.field, item.message])),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with secure access to your travel records."
      alternateText="Already registered?"
      alternateLink={{ to: '/login', label: 'Sign in' }}
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <div className="form-error" role="alert">{error}</div>}
        <FormField
          id="name"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={form.name}
          error={fieldErrors.name}
          onChange={updateField}
        />
        <FormField
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          error={fieldErrors.email}
          onChange={updateField}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength="8"
          value={form.password}
          error={fieldErrors.password}
          onChange={updateField}
        />
        <p className="password-hint">Use 8+ characters with uppercase, lowercase, and a number.</p>
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={updateField}
        />
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
