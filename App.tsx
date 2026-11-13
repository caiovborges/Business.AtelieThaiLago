import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientRegistry from './pages/ClientRegistry';
import EventCanvas from './pages/EventCanvas';
import EventLedger from './pages/EventLedger';
import EventPlanner from './pages/EventPlanner';
import ProposalStudio from './pages/ProposalStudio';
import ProposalEditor from './pages/ProposalEditor';
import Financeiro from './pages/Financeiro';
import LeadsBoard from './pages/LeadsBoard';
import LeadProfile from './pages/LeadProfile';
import Mensagens from './pages/Mensagens';
import AReceber from './pages/AReceber';
import ContasFixas from './pages/ContasFixas';
import { carregarMensagens } from './mensagensEditadas';
import { carregarProprias } from './mensagensProprias';
import { carregarConteudos } from './nutricao';
import CalendarPage from './pages/CalendarPage';
import Settings from './pages/Settings';

const AccessBlocked = () => {
  const { profile, profileError, refreshProfile, signOut } = useAuth();

  const message = profileError && !profile
    ? { icon: 'cloud_off', title: 'Não foi possível verificar seu acesso', text: 'Confira sua internet e tente novamente.' }
    : profile?.role === 'denied'
      ? { icon: 'block', title: 'Acesso negado', text: 'Sua conta não tem permissão para usar este sistema.' }
      : { icon: 'hourglass_top', title: 'Aguardando aprovação', text: 'Sua conta ainda precisa ser aprovada pela administração do ateliê.' };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background-light p-6">
      <div className="w-full max-w-md border-2 border-secondary bg-white p-8 text-center shadow-hard">
        <span className="material-symbols-outlined text-5xl text-secondary/40">{message.icon}</span>
        <h1 className="mt-4 font-display text-2xl font-bold text-secondary">{message.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{message.text}</p>
        <div className="mt-6 flex flex-col gap-3">
          {profileError && !profile && (
            <button
              onClick={() => refreshProfile()}
              className="h-12 border-2 border-secondary bg-primary font-display text-sm font-bold uppercase tracking-wider text-white shadow-hard-sm"
            >
              Tentar novamente
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="h-12 border-2 border-secondary bg-white font-display text-sm font-bold uppercase tracking-wider text-secondary hover:bg-gray-50"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
};

const ProtectedRoute = () => {
  const { user, loading, profileLoading, isApproved } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [, setMensagensCarregadas] = React.useState(0);

  // Atualiza a tela quando os textos editados chegam
  React.useEffect(() => {
    if (!isApproved) return;
    Promise.all([carregarMensagens(), carregarConteudos(), carregarProprias()]).finally(() => setMensagensCarregadas(v => v + 1));
  }, [isApproved]);

  if (loading || profileLoading) {
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

  if (!isApproved) {
    return <AccessBlocked />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background-light text-secondary overflow-x-hidden relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">
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
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="leads" element={<LeadsBoard />} />
              <Route path="leads/:id" element={<LeadProfile />} />
              <Route path="mensagens" element={<Mensagens />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="clients" element={<ClientRegistry />} />
              <Route path="events" element={<EventCanvas />} />
              <Route path="planejamento" element={<EventPlanner />} />
              <Route path="events/:id" element={<EventLedger />} />
              <Route path="proposals" element={<ProposalStudio />} />
              <Route path="proposals/:id" element={<ProposalEditor />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="a-receber" element={<AReceber />} />
              <Route path="contas-fixas" element={<ContasFixas />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );
};

export default App;
