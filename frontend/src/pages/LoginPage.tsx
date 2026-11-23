import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onNavigateToRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.message || 'Invalid email or password.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during login.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setSubmitting(true);

    try {
      const result = await login(demoEmail, demoPass);
      if (!result.success) {
        setError(result.message || 'Demo login failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during demo login.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍿</div>
          <h1>Snack Overflow</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Office snack inventory & voting platform
          </p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={submitting}
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Login */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px dashed #e2e8f0' }}>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.65rem',
              textAlign: 'center',
            }}
          >
            Instant Demo Access
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.65rem 0.5rem',
                borderRadius: '8px',
                border: '1px solid #c7d2fe',
                background: '#eef2ff',
                color: '#4338ca',
                cursor: submitting ? 'not-allowed' : 'pointer',
                textAlign: 'center',
              }}
              disabled={submitting}
              onClick={() => handleDemoLogin('member@snackoverflow.com', 'MemberPassword123!')}
            >
              <div style={{ fontSize: '1.1rem', marginBottom: '2px' }}>👤</div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Demo Member</div>
              <div style={{ fontSize: '0.7rem', color: '#6366f1', marginTop: '2px' }}>member@snackoverflow.com</div>
            </button>

            <button
              type="button"
              className="btn"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.65rem 0.5rem',
                borderRadius: '8px',
                border: '1px solid #fbcfe8',
                background: '#fdf2f8',
                color: '#9d174d',
                cursor: submitting ? 'not-allowed' : 'pointer',
                textAlign: 'center',
              }}
              disabled={submitting}
              onClick={() => handleDemoLogin('admin@snackoverflow.com', 'AdminPassword123!')}
            >
              <div style={{ fontSize: '1.1rem', marginBottom: '2px' }}>🛡️</div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Demo Admin</div>
              <div style={{ fontSize: '0.7rem', color: '#db2777', marginTop: '2px' }}>admin@snackoverflow.com</div>
            </button>
          </div>
        </div>

        <div className="auth-footer">
          Don't have an account yet?{' '}
          <a
            role="button"
            tabIndex={0}
            onClick={onNavigateToRegister}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateToRegister()}
          >
            Register here
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
