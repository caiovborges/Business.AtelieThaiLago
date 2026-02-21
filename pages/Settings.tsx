import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth, UserRole } from '../AuthContext';

interface UserProfileRow {
    id: string;
    user_id: string;
    display_name: string | null;
    role: UserRole;
    created_at: string;
    updated_at: string;
}

const roleLabels: Record<UserRole, string> = {
    admin: 'Administrador',
    member: 'Membro',
    pending: 'Pendente',
    denied: 'Negado',
};

const roleColors: Record<UserRole, string> = {
    admin: 'bg-primary text-white',
    member: 'bg-accent-success/20 text-accent-success border border-accent-success/30',
    pending: 'bg-amber-100 text-amber-700 border border-amber-300',
    denied: 'bg-accent-error/20 text-accent-error border border-accent-error/30',
};

const roleIcons: Record<UserRole, string> = {
    admin: 'shield_person',
    member: 'verified_user',
    pending: 'hourglass_top',
    denied: 'block',
};

const Settings = () => {
    const { isAdmin, user } = useAuth();
    const [profiles, setProfiles] = useState<UserProfileRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: true });
        setProfiles((data as UserProfileRow[]) || []);
        setLoading(false);
    };

    const updateRole = async (profileId: string, newRole: UserRole) => {
        setUpdating(profileId);
        await supabase
            .from('user_profiles')
            .update({ role: newRole, updated_at: new Date().toISOString() })
            .eq('id', profileId);
        await fetchProfiles();
        setUpdating(null);
    };

    const pendingCount = profiles.filter(p => p.role === 'pending').length;

    if (!isAdmin) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                    <span className="material-symbols-outlined text-6xl text-secondary/20 mb-4">lock</span>
                    <h2 className="font-display text-2xl font-bold text-secondary mb-2">Acesso Restrito</h2>
                    <p className="text-secondary/60 font-mono text-sm">Apenas administradores podem acessar esta página.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-secondary bg-surface px-8 py-5">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary flex items-center justify-center shadow-hard-sm border-2 border-secondary">
                        <span className="material-symbols-outlined text-white text-xl">settings</span>
                    </div>
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-secondary uppercase">Configurações</h1>
                        <p className="font-mono text-xs text-secondary/50 mt-0.5">Gerenciamento de acesso</p>
                    </div>
                </div>
                {pendingCount > 0 && (
                    <div className="flex items-center gap-2 bg-amber-100 border-2 border-amber-300 px-4 py-2 shadow-hard-sm">
                        <span className="material-symbols-outlined text-amber-600 text-lg">notification_important</span>
                        <span className="font-display text-sm font-bold text-amber-700">
                            {pendingCount} {pendingCount === 1 ? 'solicitação pendente' : 'solicitações pendentes'}
                        </span>
                    </div>
                )}
            </header>

            <div className="p-8 max-w-4xl mx-auto">
                {/* User Management Section */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-primary">group</span>
                        <h2 className="font-display text-lg font-bold text-secondary uppercase tracking-wider">Usuários</h2>
                        <span className="font-mono text-xs text-secondary/50 bg-surface border border-secondary/10 px-2 py-0.5">
                            {profiles.length} {profiles.length === 1 ? 'usuário' : 'usuários'}
                        </span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <span className="animate-spin material-symbols-outlined text-primary text-3xl">progress_activity</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {profiles.map((p) => {
                                const isCurrentUser = p.user_id === user?.id;
                                const isPending = p.role === 'pending';
                                const isDenied = p.role === 'denied';

                                return (
                                    <div
                                        key={p.id}
                                        className={`border-2 border-secondary bg-surface p-5 transition-all ${isPending ? 'shadow-hard border-amber-400 bg-amber-50/30' : 'shadow-hard-sm'}`}
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            {/* User Info */}
                                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                                <div className={`h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-secondary shrink-0 ${p.role === 'admin' ? 'bg-primary' : p.role === 'member' ? 'bg-secondary' : p.role === 'pending' ? 'bg-amber-500' : 'bg-gray-400'}`}>
                                                    <span className="material-symbols-outlined text-xl">{roleIcons[p.role]}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-display font-bold text-secondary truncate">
                                                            {p.display_name || 'Sem nome'}
                                                        </h3>
                                                        {isCurrentUser && (
                                                            <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 uppercase font-bold">Você</span>
                                                        )}
                                                    </div>
                                                    <p className="font-mono text-xs text-secondary/50 truncate mt-0.5">
                                                        Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className={`font-display text-xs font-bold uppercase tracking-wider px-3 py-1.5 ${roleColors[p.role]}`}>
                                                    {roleLabels[p.role]}
                                                </span>

                                                {/* Action Buttons */}
                                                {!isCurrentUser && (
                                                    <div className="flex items-center gap-2">
                                                        {isPending && (
                                                            <>
                                                                <button
                                                                    onClick={() => updateRole(p.id, 'member')}
                                                                    disabled={updating === p.id}
                                                                    className="flex items-center gap-1.5 bg-accent-success text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                    title="Aprovar acesso"
                                                                >
                                                                    {updating === p.id ? (
                                                                        <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                                                                    ) : (
                                                                        <span className="material-symbols-outlined text-sm">check</span>
                                                                    )}
                                                                    Aprovar
                                                                </button>
                                                                <button
                                                                    onClick={() => updateRole(p.id, 'denied')}
                                                                    disabled={updating === p.id}
                                                                    className="flex items-center gap-1.5 bg-accent-error text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                    title="Negar acesso"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                                    Negar
                                                                </button>
                                                            </>
                                                        )}

                                                        {isDenied && (
                                                            <button
                                                                onClick={() => updateRole(p.id, 'member')}
                                                                disabled={updating === p.id}
                                                                className="flex items-center gap-1.5 bg-accent-success text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                title="Reativar acesso"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">undo</span>
                                                                Reativar
                                                            </button>
                                                        )}

                                                        {p.role === 'member' && (
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => updateRole(p.id, 'admin')}
                                                                    disabled={updating === p.id}
                                                                    className="flex items-center gap-1.5 bg-secondary text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                    title="Tornar admin"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">shield_person</span>
                                                                    Admin
                                                                </button>
                                                                <button
                                                                    onClick={() => updateRole(p.id, 'denied')}
                                                                    disabled={updating === p.id}
                                                                    className="flex items-center gap-1.5 bg-accent-error/80 text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                    title="Remover acesso"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">person_remove</span>
                                                                    Remover
                                                                </button>
                                                            </div>
                                                        )}

                                                        {p.role === 'admin' && (
                                                            <button
                                                                onClick={() => updateRole(p.id, 'member')}
                                                                disabled={updating === p.id}
                                                                className="flex items-center gap-1.5 bg-gray-500 text-white font-display text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 border-secondary shadow-hard-sm hover:shadow-hard hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
                                                                title="Remover admin"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">shield</span>
                                                                Remover Admin
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default Settings;
