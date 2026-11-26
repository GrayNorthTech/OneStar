import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { OverviewPage } from './pages/OverviewPage';
import { RoadmapProjectsPage } from './pages/RoadmapProjectsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ServiceCatalogPage } from './pages/ServiceCatalogPage';
import { CrmPage } from './pages/CrmPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { ServiceDeskPage } from './pages/ServiceDeskPage';
import { WorkOrdersCalendarPage } from './pages/WorkOrdersCalendarPage';
import { AssetsTechPage } from './pages/AssetsTechPage';
import { FinancePage } from './pages/FinancePage';
import { OrganizationPage } from './pages/OrganizationPage';
import { AdminPage } from './pages/AdminPage';

const AuthenticatedRoutes: React.FC = () => {
  const { bootstrapping, user } = useApp();

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9] dark:bg-[#0B1018] text-xs font-mono text-[#64748B]">
        Initializing KORTRIX ONE...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppShell>
      <Routes>
        {/* WORKSPACE */}
        <Route path="/" element={<OverviewPage />} />
        <Route path="/tasks" element={<RoadmapProjectsPage mode="tasks" />} />
        <Route path="/calendar" element={<WorkOrdersCalendarPage mode="calendar" />} />
        <Route path="/notifications" element={<OrganizationPage section="notifications" />} />

        {/* CUSTOMER MANAGEMENT */}
        <Route path="/customers" element={<CrmPage section="customers" />} />
        <Route path="/customers/:id" element={<CustomerProfilePage />} />
        <Route path="/organizations" element={<CrmPage section="organizations" />} />
        <Route path="/contacts" element={<CrmPage section="contacts" />} />
        <Route path="/leads" element={<CrmPage section="leads" />} />

        {/* SERVICE OPERATIONS */}
        <Route path="/service-desk" element={<ServiceDeskPage />} />
        <Route path="/service-desk/:id" element={<ServiceDeskPage />} />
        <Route path="/service-requests" element={<ServiceDeskPage requestsOnly />} />
        <Route path="/work-orders" element={<WorkOrdersCalendarPage mode="work-orders" />} />
        <Route path="/appointments" element={<WorkOrdersCalendarPage mode="appointments" />} />
        <Route path="/service-catalog" element={<ServiceCatalogPage />} />

        {/* TECHNOLOGY */}
        <Route path="/assets" element={<AssetsTechPage view="assets" />} />
        <Route path="/infrastructure" element={<AssetsTechPage view="infrastructure" />} />
        <Route path="/security" element={<AssetsTechPage view="security" />} />
        <Route path="/lifecycle" element={<AssetsTechPage view="lifecycle" />} />
        <Route path="/projects" element={<RoadmapProjectsPage mode="projects" />} />

        {/* FINANCE */}
        <Route path="/quotations" element={<FinancePage section="quotations" />} />
        <Route path="/invoices" element={<FinancePage section="invoices" />} />
        <Route path="/expenses" element={<FinancePage section="expenses" />} />
        <Route path="/financial-overview" element={<FinancePage section="overview" />} />

        {/* CORPORATE */}
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/policies" element={<DocumentsPage policiesOnly />} />
        <Route path="/roadmap" element={<RoadmapProjectsPage mode="roadmap" />} />
        <Route path="/employees" element={<OrganizationPage section="employees" />} />
        <Route path="/departments" element={<OrganizationPage section="departments" />} />

        {/* ADMINISTRATION */}
        <Route path="/admin/users" element={<AdminPage section="users" />} />
        <Route path="/admin/roles" element={<AdminPage section="roles" />} />
        <Route path="/admin/audit-logs" element={<AdminPage section="audit-logs" />} />
        <Route path="/admin/integrations" element={<AdminPage section="integrations" />} />
        <Route path="/admin/settings" element={<AdminPage section="settings" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AuthenticatedRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
