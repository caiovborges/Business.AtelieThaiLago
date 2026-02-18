import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type UserRole = 'admin' | 'member' | 'pending' | 'denied';

interface UserProfile {
    id: string;
    user_id: string;
    display_name: string | null;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    isApproved: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        try {
            const { data } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', userId)
                .single();
            setProfile(data as UserProfile | null);
        } catch {
            setProfile(null);
        }
    };

    const refreshProfile = async () => {
        if (user) await fetchProfile(user.id);
    };

    useEffect(() => {
        // Safety timeout to prevent infinite loading
        const timer = setTimeout(() => {
            setLoading(false);
        }, 2000);

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
            clearTimeout(timer);
            // Load profile in background - don't block loading
            if (session?.user) {
                fetchProfile(session.user.id);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
            clearTimeout(timer);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setProfile(null);
            }
        });

        return () => {
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signUp = async (email: string, password: string, displayName?: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName || email }
            }
        });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
    };

    const isAdmin = profile?.role === 'admin';
    const isApproved = profile?.role === 'admin' || profile?.role === 'member';

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, isApproved, signIn, signUp, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
