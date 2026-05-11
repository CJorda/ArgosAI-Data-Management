import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loginRequest, logoutRequest, meRequest, refreshRequest } from "../api/services";

const STORAGE_KEY = "argosai_auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const storedRaw = localStorage.getItem(STORAGE_KEY);

      if (!storedRaw) {
        setIsLoading(false);
        return;
      }

      try {
        const stored = JSON.parse(storedRaw);

        if (stored.accessToken) {
          const me = await meRequest(stored.accessToken);
          setUser(me);
          setAccessToken(stored.accessToken);
          setRefreshToken(stored.refreshToken || null);
          setIsLoading(false);
          return;
        }

        if (stored.refreshToken) {
          const refreshed = await refreshRequest(stored.refreshToken);
          const me = await meRequest(refreshed.accessToken);

          setUser(me);
          setAccessToken(refreshed.accessToken);
          setRefreshToken(refreshed.refreshToken);

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken
            })
          );
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  const login = async ({ tenantCode, email, password }) => {
    const response = await loginRequest({ tenantCode, email, password });

    setUser(response.user);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken
      })
    );
  };

  const logout = async () => {
    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } catch {
      // Logout should clear local state even if API call fails.
    }

    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => {
      const features = Array.isArray(user?.features) ? user.features : null;

      return {
        user,
        features,
        accessToken,
        refreshToken,
        isLoading,
        isAuthenticated: Boolean(user && accessToken),
        hasFeature: (featureKey) => {
          if (!featureKey) {
            return true;
          }

          // If the backend does not send explicit features, preserve full access.
          if (!Array.isArray(features)) {
            return true;
          }

          return features.includes(featureKey);
        },
        login,
        logout
      };
    },
    [user, accessToken, refreshToken, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
