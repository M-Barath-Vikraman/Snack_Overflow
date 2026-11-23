import React, { useState } from 'react';
import { getApiBaseUrl } from './config/env';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import ActivityPage from './pages/ActivityPage';
import AddEditSnackModal from './components/AddEditSnackModal';
import { AppPage } from './components/Layout';

export const App: React.FC = () => {
  // 1. Strict Runtime Configuration Check
  let configError: string | null = null;
  try {
    getApiBaseUrl();
  } catch (err: any) {
    configError = err.message;
  }

  // If runtime configuration in window.__APP_CONFIG__ is missing or malformed, display error boundary
  if (configError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '540px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            border: '1px solid #fecaca',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚙️</div>
          <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem 0', fontSize: '1.4rem' }}>
            Configuration Error
          </h2>
          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Snack Overflow requires a valid runtime configuration file to communicate with the API.
          </p>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              margin: '1rem 0',
            }}
          >
            {configError}
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            Ensure <code>public/config.js</code> is accessible and sets{' '}
            <code>window.__APP_CONFIG__.API_BASE_URL</code>.
          </p>
        </div>
      </div>
    );
  }

  // 2. Authentication State Handling
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');

  // Global Add Snack Modal state (opened from Sidebar or elsewhere)
  const [isAddSnackModalOpen, setIsAddSnackModalOpen] = useState<boolean>(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState<number>(0);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontSize: '3rem', animation: 'bounce 1s infinite' }}>🍿</div>
        <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 500 }}>
          Initializing Snack Overflow...
        </p>
      </div>
    );
  }

  // 3. Unauthenticated Views
  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onNavigateToRegister={() => setAuthView('register')} />;
  }

  // 4. Authenticated SaaS Application
  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onOpenAddSnack={isAdmin ? () => setIsAddSnackModalOpen(true) : undefined}
    >
      {currentPage === 'dashboard' && (
        <DashboardPage
          onNavigateToInventory={() => setCurrentPage('inventory')}
          onNavigateToActivity={() => setCurrentPage('activity')}
          onOpenAddSnack={isAdmin ? () => setIsAddSnackModalOpen(true) : undefined}
        />
      )}
      {currentPage === 'inventory' && (
        <InventoryPage key={inventoryRefreshKey} />
      )}
      {currentPage === 'activity' && (
        isAdmin ? (
          <ActivityPage />
        ) : (
          <DashboardPage onNavigateToInventory={() => setCurrentPage('inventory')} />
        )
      )}

      {/* Admin Add Snack Modal from Sidebar Action */}
      {isAdmin && (
        <AddEditSnackModal
          isOpen={isAddSnackModalOpen}
          onClose={() => setIsAddSnackModalOpen(false)}
          snack={null}
          onSaved={() => {
            setInventoryRefreshKey((k) => k + 1);
            setCurrentPage('inventory');
          }}
        />
      )}
    </Layout>
  );
};

export default App;
