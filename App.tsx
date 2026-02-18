import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientRegistry from './pages/ClientRegistry';
import EventCanvas from './pages/EventCanvas';
import EventLedger from './pages/EventLedger';
import ProposalStudio from './pages/ProposalStudio';
import ProposalEditor from './pages/ProposalEditor';
import Financeiro from './pages/Financeiro';
import LeadsBoard from './pages/LeadsBoard';
import CalendarPage from './pages/CalendarPage';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background-light">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 bg-primary border-2 border-secondary flex items-center justify-center shadow-hard animate-pulse">
            <span className="material-symbols-outlined text-white text-3xl">brush</span>
          </div>
          <p className="font-display text-sm font-bold text-secondary uppercase tracking-widest">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background-light text-secondary">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="leads" element={<LeadsBoard />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="clients" element={<ClientRegistry />} />
            <Route path="events" element={<EventCanvas />} />
            <Route path="events/:id" element={<EventLedger />} />
            <Route path="proposals" element={<ProposalStudio />} />
            <Route path="proposals/:id" element={<ProposalEditor />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
};

export default App;
