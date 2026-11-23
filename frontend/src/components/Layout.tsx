import React, { useState, useRef, useEffect, ReactNode } from 'react';
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
  const [profileDropdownOpen, setProfileDropdownOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [profileDropdownOpen]);

  // Compute user initials for avatar
  const getInitials = (name?: string, email?: string): string => {
    if (name && name.trim().length > 0) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email && email.length > 0) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'SO';
  };

  const handleNavClick = (page: AppPage) => {
    onNavigate(page);
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  };

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="top-nav">
        <div className="nav-container">
          {/* Left: Brand Logo & Links */}
          <div className="nav-left">
            <div
              className="nav-brand"
              onClick={() => handleNavClick('dashboard')}
              title="Snack Overflow Home"
            >
              <span className="nav-brand-logo">🍿</span>
              <span className="nav-brand-title">Snack Overflow</span>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="nav-links">
              <button
                type="button"
                className={`nav-item-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleNavClick('dashboard')}
              >
                <span>📊</span>
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${currentPage === 'inventory' ? 'active' : ''}`}
                onClick={() => handleNavClick('inventory')}
              >
                <span>🍪</span>
                <span>Snack Inventory</span>
              </button>

              {/* Activity History Link: STRICTLY ADMIN ONLY */}
              {isAdmin && (
                <button
                  type="button"
                  className={`nav-item-btn ${currentPage === 'activity' ? 'active' : ''}`}
                  onClick={() => handleNavClick('activity')}
                >
                  <span>📜</span>
                  <span>Activity History</span>
                </button>
              )}
            </nav>
          </div>

          {/* Right: Live Sync Badge + User Profile Dropdown + Mobile Toggle */}
          <div className="nav-right">
            <ConnectionStatusBadge />

            {/* User Profile Section with Clickable Dropdown */}
            <div className="profile-dropdown-wrapper" ref={dropdownRef}>
              <button
                type="button"
                className="profile-trigger"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={profileDropdownOpen}
                title="Account Menu"
              >
                <div className="avatar-circle">
                  {getInitials(user?.name, user?.email)}
                </div>
                <div className="profile-trigger-info">
                  <span className="profile-trigger-name">{user?.name || 'User'}</span>
                  <span className={`role-badge ${isAdmin ? 'admin' : 'member'}`}>
                    {user?.role || 'MEMBER'}
                  </span>
                  <span className={`profile-chevron ${profileDropdownOpen ? 'open' : ''}`}>
                    ▼
                  </span>
                </div>
              </button>

              {/* Dropdown Menu */}
              {profileDropdownOpen && (
                <div className="profile-dropdown-menu" role="menu">
                  <div className="profile-menu-header">
                    <div className="profile-menu-name">{user?.name || 'User'}</div>
                    <div className="profile-menu-email">{user?.email || 'user@example.com'}</div>
                    <div className="profile-menu-role">
                      <span className={`role-badge ${isAdmin ? 'admin' : 'member'}`}>
                        {user?.role || 'MEMBER'}
                      </span>
                    </div>
                  </div>

                  {isAdmin && onOpenAddSnack && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenAddSnack();
                        }}
                      >
                        + Add New Snack
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="profile-logout-btn"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    role="menuitem"
                  >
                    <span>🚪</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Nav Toggle */}
            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation (visible on <= 768px when toggled) */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <button
            type="button"
            className={`nav-item-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className={`nav-item-btn ${currentPage === 'inventory' ? 'active' : ''}`}
            onClick={() => handleNavClick('inventory')}
          >
            <span>🍪</span>
            <span>Snack Inventory</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className={`nav-item-btn ${currentPage === 'activity' ? 'active' : ''}`}
              onClick={() => handleNavClick('activity')}
            >
              <span>📜</span>
              <span>Activity History</span>
            </button>
          )}

          {isAdmin && onOpenAddSnack && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginTop: '0.5rem', width: '100%' }}
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAddSnack();
              }}
            >
              + Add New Snack
            </button>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
            <button
              type="button"
              className="profile-logout-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
            >
              <span>🚪</span>
              <span>Sign Out ({user?.name})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;
