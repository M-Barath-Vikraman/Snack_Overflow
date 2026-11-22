import React, { useState, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import ConnectionStatusBadge from './ConnectionStatusBadge';

export type AppPage = 'dashboard' | 'inventory' | 'activity';

interface LayoutProps {
  children: ReactNode;
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenAddSnack?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentPage,
  onNavigate,
  onOpenAddSnack,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const handleNavClick = (page: AppPage) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-container">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: 35,
          }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="logo">
              <span>🍿</span>
              <div>Snack Overflow</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: mobileMenuOpen ? 'block' : 'none' }}
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              &times;
            </button>
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <ConnectionStatusBadge />
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentPage === 'inventory' ? 'active' : ''}`}
            onClick={() => handleNavClick('inventory')}
          >
            <span>🍪</span>
            <span>Snack Inventory</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className={`nav-link ${currentPage === 'activity' ? 'active' : ''}`}
              onClick={() => handleNavClick('activity')}
            >
              <span>📜</span>
              <span>Activity History</span>
            </button>
          )}

          {isAdmin && onOpenAddSnack && (
            <div style={{ marginTop: '1.5rem', padding: '0 0.25rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAddSnack();
                }}
              >
                + Add Snack Item
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-info">
              <div className="user-name">{user?.name || 'User'}</div>
              <div className="user-email">{user?.email}</div>
              <div style={{ marginTop: '0.25rem' }}>
                <span className={`role-badge ${isAdmin ? 'admin' : 'member'}`}>
                  {user?.role || 'MEMBER'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={logout}
              title="Sign Out"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Mobile Topbar */}
        <header className="topbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🍿</span> Snack Overflow
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ConnectionStatusBadge />
            <span className={`role-badge ${isAdmin ? 'admin' : 'member'}`}>
              {user?.role}
            </span>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
};

export default Layout;
