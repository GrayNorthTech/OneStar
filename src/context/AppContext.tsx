import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, setAuthToken } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  position: string;
  department_id: string | null;
  role_id: string;
  role_name: string;
  status: string;
  permissions: Record<string, Record<string, boolean>>;
}

export interface AuthBootstrapStatus {
  authConfigured: boolean;
  entraConfigured: boolean;
  branding: {
    companyName: string;
    logoDataUrl: string;
    brandColor: string;
    defaultTheme: 'light' | 'dark';
  };
}

export interface CompanySettings {
  id: string;
  company_name: string;
  legal_status: string;
  website: string;
  affiliation: string;
  primary_email: string;
  telephone: string;
  region: string;
  timezone: string;
  currency: string;
  brand_color: string;
  logo_data_url: string;
  business_address: string;
  mailing_address: string;
  tax_rate: number;
  tax_label: string;
  customer_prefix: string;
  ticket_prefix: string;
  work_order_prefix: string;
  asset_prefix: string;
  quote_prefix: string;
  invoice_prefix: string;
  document_prefix: string;
  business_hours_json: string;
  notification_prefs_json: string;
  asset_grading_json: string;
  default_theme: 'light' | 'dark';
}

interface AppContextValue {
  bootstrapping: boolean;
  authStatus: AuthBootstrapStatus | null;
  user: AuthUser | null;
  settings: CompanySettings | null;
  theme: 'light' | 'dark';
  unreadNotifications: number;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  onAuthenticated: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (moduleName: string, action: 'view' | 'create' | 'edit' | 'delete' | 'export' | 'admin') => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthBootstrapStatus | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const applyTheme = useCallback((next: 'light' | 'dark') => {
    setThemeState(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, applyTheme]);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await apiFetch<{ settings: CompanySettings }>('/api/settings');
      setSettings(data.settings);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser; unreadNotifications: number }>('/api/auth/me');
      setUser(data.user);
      setUnreadNotifications(data.unreadNotifications || 0);
    } catch {
      // Session invalid
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    setBootstrapping(true);
    try {
      const status = await apiFetch<AuthBootstrapStatus>('/api/auth/status');
      setAuthStatus(status);
      if (status.branding?.defaultTheme === 'dark') {
        applyTheme('dark');
      } else {
        applyTheme('light');
      }
    } catch (err) {
      console.error('Bootstrap status failed:', err);
    } finally {
      setBootstrapping(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const onAuthenticated = useCallback(async (token: string, authUser: AuthUser) => {
    setAuthToken(token);
    setUser(authUser);
    try {
      const [settingsRes, meRes] = await Promise.all([
        apiFetch<{ settings: CompanySettings }>('/api/settings'),
        apiFetch<{ user: AuthUser; unreadNotifications: number }>('/api/auth/me'),
      ]);
      setSettings(settingsRes.settings);
      setUnreadNotifications(meRes.unreadNotifications || 0);
      if (settingsRes.settings?.default_theme) {
        applyTheme(settingsRes.settings.default_theme);
      }
    } catch {
      // Non-fatal
    }
  }, [applyTheme]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Always clear client session
    }
    setAuthToken(null);
    setUser(null);
    setUnreadNotifications(0);
    await loadBootstrap();
  }, [loadBootstrap]);

  const hasPermission = useCallback(
    (moduleName: string, action: 'view' | 'create' | 'edit' | 'delete' | 'export' | 'admin'): boolean => {
      if (!user) return false;
      if (user.role_name === 'Owner') return true;
      return Boolean(user.permissions?.[moduleName]?.[action]);
    },
    [user]
  );

  return (
    <AppContext.Provider
      value={{
        bootstrapping,
        authStatus,
        user,
        settings,
        theme,
        unreadNotifications,
        setTheme: applyTheme,
        toggleTheme,
        onAuthenticated,
        logout,
        refreshSettings,
        refreshProfile,
        hasPermission,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
