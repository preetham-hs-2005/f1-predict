import React, { createContext, useContext, useState, useEffect } from "react";
import * as authApi from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  totalPoints: number;
}

interface SessionData {
  user: User;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>;
  setUsername: (username: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (name: string) => Promise<{ success: boolean; error?: string }>;
  sendVerificationCode: () => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  correctEmail: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = "f1_session";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session from localStorage on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const session = localStorage.getItem(SESSION_KEY);
        if (session) {
          const sessionData: SessionData = JSON.parse(session);
          // Restore token to API client first
          if (sessionData.token) {
            apiClient.setAuthToken(sessionData.token, sessionData.user);
          }
          
          // Validate token by fetching current user
          try {
            const currentUser = await authApi.getCurrentUser();
            setUser(currentUser);
            console.log("[AuthContext] Session restored and validated for user:", currentUser.name);
          } catch (error) {
            console.warn("[AuthContext] Token validation failed, clearing session:", error);
            // Token is invalid or expired, clear it
            localStorage.removeItem(SESSION_KEY);
            setUser(null);
          }
        }
      } catch (error) {
        console.error("[AuthContext] Session restore error:", error);
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setIsLoading(false);
      }
    };
    
    initSession();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const userData = await authApi.loginUser(email, password);
      setUser(userData);
      // Token is stored by authApi.loginUser via apiClient.setAuthToken
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string, username: string) => {
    try {
      setIsLoading(true);
      const userData = await authApi.registerUser(name, email, password, username);
      
      setUser(userData);
      // Note: apiClient.setAuthToken is called in authApi.registerUser
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logoutUser();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      localStorage.removeItem(SESSION_KEY);
      setIsLoading(false);
    }
  };

  const setUsername = async (username: string) => {
    try {
      setIsLoading(true);
      const userData = await authApi.setUsername(username);
      setUser(userData);
      
      // Update session storage immediately to avoid refresh loss
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const sessionData: SessionData = JSON.parse(session);
        sessionData.user = userData;
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to set username";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (name: string) => {
    try {
      setIsLoading(true);
      const userData = await authApi.updateProfile(name);
      setUser(userData);
      
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const sessionData: SessionData = JSON.parse(session);
        sessionData.user = userData;
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = (updated: User) => {
    setUser(updated);
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      const sessionData: SessionData = JSON.parse(session);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...sessionData, user: updated }));
    }
  };

  const sendVerificationCode = () => authApi.sendVerificationCode();
  const verifyEmailCode = async (code: string) => saveUser(await authApi.verifyEmailCode(code));
  const correctEmail = async (email: string, password: string) => {
    const result = await authApi.correctEmail(email, password);
    saveUser(result.user);
    return result.verificationEmailSent;
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout, setUsername, updateProfile, sendVerificationCode, verifyEmailCode, correctEmail }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
