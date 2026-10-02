/**
 * Authentication API - All auth-related API calls
 */

import { apiClient, ApiResponse } from "./client";

export interface AuthUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  totalPoints: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse extends ApiResponse<AuthUser> {
  user?: AuthUser;
  token?: string;
}

/**
 * Login with email and password
 */
export async function loginUser(
  email: string,
  password: string
): Promise<AuthUser> {
  const response = await apiClient.post<AuthResponse>("/api/auth/login", {
    email,
    password,
  });


  if (!response.success || !response.user) {
    throw new Error(response.error || "Login failed");
  }

  if (response.token) {
    apiClient.setAuthToken(response.token, response.user);
  }

  return response.user;
}

/**
 * Register a new user
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  username: string
): Promise<AuthUser> {
  const response = await apiClient.post<AuthResponse>("/api/auth/register", {
    name,
    email,
    password,
    username,
  });

  if (!response.success || !response.user) {
    throw new Error(response.error || "Registration failed");
  }

  // Store token if provided
  if (response.token) {
    apiClient.setAuthToken(response.token, response.user);
  }

  return response.user;
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthResponse>("/api/auth/me");

  if (!response.success || !response.user) {
    throw new Error(response.error || "Failed to fetch user");
  }

  return response.user;
}

/**
 * Set user's name (Profile Edit)
 */
export async function updateProfile(name: string): Promise<AuthUser> {
  const response = await apiClient.put<AuthResponse>("/api/auth/profile", {
    name,
  });

  if (!response.success || !response.user) {
    throw new Error(response.error || "Failed to update profile name");
  }

  // Store token if provided
  if (response.token) {
    apiClient.setAuthToken(response.token, response.user);
  }

  return response.user;
}

/**
 * Logout user
 */
export async function logoutUser(): Promise<void> {
  try {
    await apiClient.post("/api/auth/logout", {});
  } catch {
    // Logout always clears local session, even if API fails
  } finally {
    apiClient.clearAuthToken();
  }
}

/**
 * Set user's username
 */
export async function setUsername(username: string): Promise<AuthUser> {
  const response = await apiClient.put<AuthResponse>("/api/auth/username", {
    username,
  });

  if (!response.success || !response.user) {
    throw new Error(response.error || "Failed to set username");
  }

  // Store token if provided
  if (response.token) {
    apiClient.setAuthToken(response.token, response.user);
  }

  return response.user;
}

export async function sendVerificationCode(): Promise<void> {
  await apiClient.post("/api/auth/email-verification/send", {});
}

export async function verifyEmailCode(code: string): Promise<AuthUser> {
  const response = await apiClient.post<AuthResponse>("/api/auth/email-verification/verify", { code });
  if (!response.success || !response.user) throw new Error(response.error || "Verification failed");
  return response.user;
}

export async function correctEmail(email: string, password: string): Promise<{ user: AuthUser; verificationEmailSent: boolean }> {
  const response = await apiClient.put<AuthResponse & { verificationEmailSent?: boolean }>("/api/auth/email-verification/email", { email, password });
  if (!response.success || !response.user || !response.token) throw new Error(response.error || "Could not update email");
  apiClient.setAuthToken(response.token, response.user);
  return { user: response.user, verificationEmailSent: Boolean(response.verificationEmailSent) };
}
