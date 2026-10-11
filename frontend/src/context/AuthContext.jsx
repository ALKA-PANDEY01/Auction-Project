import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getProfile, login as loginRequest, logout as logoutRequest } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  const refreshUser = useCallback(async () => {
    setStatus("loading");
    try {
      const profile = await getProfile();
      setUser(profile);
      setStatus("authenticated");
      return profile;
    } catch (error) {
      setUser(null);
      setStatus(error.response ? "anonymous" : "error");
      throw error;
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  const signIn = useCallback(async (credentials) => {
    await loginRequest(credentials);
    return refreshUser();
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    isAuthenticated: status === "authenticated" && user !== null,
    isLoading: status === "loading",
    refreshUser,
    signIn,
    signOut,
  }), [user, status, refreshUser, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
