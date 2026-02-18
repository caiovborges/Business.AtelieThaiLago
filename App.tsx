import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import Settings from './pages/Settings';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

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
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b-2 border-secondary bg-surface sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-full bg-cover bg-center border-2 border-secondary shadow-sm"
              style={{ backgroundImage: 'url("https://picsum.photos/200/200?random=1")' }}
            ></div>
            <h1 className="font-display text-lg font-bold leading-none tracking-tight text-secondary">Ateliê Thai Lago</h1>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 border-2 border-secondary rounded-sm hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>

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
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
};

export default App;
