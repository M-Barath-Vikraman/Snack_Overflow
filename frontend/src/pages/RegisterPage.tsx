import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigateToLogin }) => {
  const { register } = useAuth();
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const result = await register(name.trim(), email.trim(), password);
      if (!result.success) {
        setError(result.message || 'Registration failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍿</div>
          <h1>Create Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Join your team on Snack Overflow
          </p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">
              Full Name
            </label>
            <input
              id="register-name"
              type="text"
              className="form-input"
              placeholder="Alex Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">
              Email Address
            </label>
            <input
              id="register-email"
              type="email"
              className="form-input"
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className="form-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={submitting}
          >
            {submitting ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <a
            role="button"
            tabIndex={0}
            onClick={onNavigateToLogin}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateToLogin()}
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
