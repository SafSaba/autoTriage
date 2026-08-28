import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { api, getAuthToken, setAuthToken } from '@/lib/api';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export interface AuthUser extends UserProfile {
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refreshUser = async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await api.auth.getMe();
      setUser(profile);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await api.auth.login(email, pass);
      setAuthToken(res.token);
      setUser(res.user);
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, pass: string, firstName?: string, lastName?: string) => {
    setLoading(true);
    try {
      const res = await api.auth.signup({ email, password: pass, firstName, lastName });
      setAuthToken(res.token);
      setUser(res.user);
    } catch (error: any) {
      toast({
        title: 'Signup Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    // Convenience login in local SUT mode using the seeded buyer account
    await login('buyer@autotriage.local', 'BuyerPassword123!');
  };

  const logout = async () => {
    setLoading(true);
    try {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your inbox for a link to reset your password.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Could not send password reset email.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        login,
        register,
        logout,
        sendPasswordReset,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
