import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, isAdmin } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const getLinkClass = (isActive: boolean) => {
    const base = "group flex items-center gap-3 px-4 py-3 transition-all rounded-sm border-2";
    if (isActive) {
      return `${base} bg-primary text-white border-secondary shadow-hard-sm`;
    }
    return `${base} border-transparent hover:bg-gray-100 text-secondary hover:border-secondary/10`;
  };

  const getIconClass = (isActive: boolean) => {
    return isActive ? "text-white" : "text-secondary group-hover:text-primary";
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 left-0 h-screen w-64 flex-col border-r-2 border-secondary bg-surface z-50 transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static flex
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-24 items-center gap-3 border-b-2 border-secondary px-6 justify-between lg:justify-start">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full bg-cover bg-center border-2 border-secondary shadow-sm"
              style={{ backgroundImage: 'url("https://picsum.photos/200/200?random=1")' }}
            ></div>
            <div className="flex flex-col">
              <h1 className="font-display text-xl font-bold leading-none tracking-tight text-secondary">Ateliê Thai Lago</h1>
              <span className="text-xs font-mono font-medium text-primary mt-1">Pinturas em Casamento</span>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-secondary hover:text-accent-error transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
          <NavLink to="/dashboard" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname === '/dashboard')}`}>dashboard</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Dashboard</span>
          </NavLink>

          <NavLink to="/clients" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/clients'))}`}>group</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Clientes</span>
          </NavLink>

          <NavLink to="/leads" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/leads'))}`}>filter_alt</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Leads</span>
          </NavLink>

          <NavLink to="/calendar" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/calendar'))}`}>calendar_month</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Calendário</span>
          </NavLink>

          <NavLink to="/events" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/events'))}`}>calendar_month</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Eventos</span>
          </NavLink>

          <NavLink to="/financeiro" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/financeiro'))}`}>account_balance</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Financeiro</span>
          </NavLink>

          <NavLink to="/proposals" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
            <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/proposals'))}`}>description</span>
            <span className="font-display text-sm font-bold uppercase tracking-wider">Propostas</span>
          </NavLink>

          {isAdmin && (
            <NavLink to="/settings" onClick={onClose} className={({ isActive }) => getLinkClass(isActive)}>
              <span className={`material-symbols-outlined ${getIconClass(location.pathname.startsWith('/settings'))}`}>settings</span>
              <span className="font-display text-sm font-bold uppercase tracking-wider">Configurações</span>
            </NavLink>
          )}
        </nav>

        <div className="border-t-2 border-secondary p-4 space-y-2">
          {user && (
            <div className="flex items-center gap-2 px-2 mb-2">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold border border-secondary">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <span className="font-mono text-xs text-gray-500 truncate flex-1">{user.email}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center justify-center gap-2 border-2 border-secondary bg-white px-4 py-2 transition-all hover:bg-gray-50 text-secondary"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span className="font-display text-xs font-bold uppercase tracking-widest">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
