import React from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { WsConnectionStatus } from '../types';

export const ConnectionStatusBadge: React.FC = () => {
  const { status, reconnect } = useWebSocket();

  const getStatusConfig = (s: WsConnectionStatus) => {
    switch (s) {
      case 'connected':
        return {
          label: 'Live Sync',
          color: '#10b981',
          bg: '#ecfdf5',
          border: '#a7f3d0',
          title: 'Connected: Real-time inventory & votes active',
          pulse: true,
        };
      case 'connecting':
        return {
          label: 'Connecting...',
          color: '#f59e0b',
          bg: '#fffbeb',
          border: '#fde68a',
          title: 'Connecting to real-time sync service',
          pulse: true,
        };
      case 'reconnecting':
        return {
          label: 'Reconnecting...',
          color: '#f59e0b',
          bg: '#fffbeb',
          border: '#fde68a',
          title: 'Connection lost. Reconnecting with backoff...',
          pulse: true,
        };
      case 'disconnected':
      default:
        return {
          label: 'Offline (REST)',
          color: '#64748b',
          bg: '#f8fafc',
          border: '#cbd5e1',
          title: 'Offline: Standard REST API calls still active. Click to reconnect.',
          pulse: false,
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div
      onClick={status === 'disconnected' ? reconnect : undefined}
      title={config.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.65rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        cursor: status === 'disconnected' ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: config.color,
          display: 'inline-block',
          animation: config.pulse ? 'pulse 2s infinite ease-in-out' : 'none',
        }}
      />
      <span>{config.label}</span>
    </div>
  );
};
export default ConnectionStatusBadge;
