import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@lead.com' },
  { role: 'Manager', email: 'haseeb@gmail.com' },
  { role: 'Agent', email: 'nafay@gmail.com' },
  { role: 'Production', email: 'neha@gmail.com' },
];
const DEMO_PASSWORD = 'password123';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e, overrides) {
    e?.preventDefault();
    const useEmail = overrides?.email ?? email;
    const usePassword = overrides?.password ?? password;
    setError('');
    setSubmitting(true);
    try {
      const user = await login(useEmail, usePassword);
      const redirectTo = location.state?.from || `/${user.role}`;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(account) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    handleSubmit(null, { email: account.email, password: DEMO_PASSWORD });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/assets/logo.webp" alt="The Wiki Studio logo" />
        </div>
        <h1>Sign in to The Wiki Studio</h1>
        <p>Attendance, production &amp; team portal</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-demo">
          <p>Quick demo login</p>
          <div className="auth-demo-grid">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="auth-demo-row"
                onClick={() => fillDemo(account)}
                disabled={submitting}
              >
                <strong>{account.role}</strong>
                <span>{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
