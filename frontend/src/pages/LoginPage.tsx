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
