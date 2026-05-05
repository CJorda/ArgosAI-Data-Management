import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

const LOGIN_PREFS_KEY = "argosai_login_prefs_v1";
const RECOVERY_EMAIL = "soporte@argosai.local";

function readStoredLoginPrefs() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(LOGIN_PREFS_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return {
      tenantCode: String(parsedValue.tenantCode || "").trim(),
      email: String(parsedValue.email || "").trim(),
      password: String(parsedValue.password || "")
    };
  } catch {
    return null;
  }
}

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const [storedPrefs] = useState(() => readStoredLoginPrefs());
  const [tenantCode, setTenantCode] = useState(storedPrefs?.tenantCode || "demo");
  const [email, setEmail] = useState(storedPrefs?.email || "admin@argosai.local");
  const [password, setPassword] = useState(storedPrefs?.password || "Admin123!");
  const [rememberPassword, setRememberPassword] = useState(Boolean(storedPrefs));
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rememberPassword) {
      return;
    }

    localStorage.removeItem(LOGIN_PREFS_KEY);
  }, [rememberPassword]);

  if (isAuthenticated) {
    const target = location.state?.from?.pathname || "/dashboard";
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const normalizedTenantCode = tenantCode.trim();
    const normalizedEmail = email.trim();

    if (!normalizedTenantCode || !normalizedEmail || !password) {
      setError("Completa usuario, email y contraseña");
      setLoading(false);
      return;
    }

    try {
      await login({ tenantCode: normalizedTenantCode, email: normalizedEmail, password });

      if (rememberPassword) {
        localStorage.setItem(
          LOGIN_PREFS_KEY,
          JSON.stringify({
            tenantCode: normalizedTenantCode,
            email: normalizedEmail,
            password
          })
        );
      } else {
        localStorage.removeItem(LOGIN_PREFS_KEY);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-shell">
        <section className="login-brand" aria-label="Presentación de ArgosAI">
          <div className="login-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img">
              <title>Logo ArgosAI</title>
              <defs>
                <linearGradient id="argos-wave" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#89fff0" />
                  <stop offset="100%" stopColor="#2fd4ff" />
                </linearGradient>
              </defs>
              <path
                d="M11 34c7.6 0 7.6-9.6 15.2-9.6S33.8 34 41.4 34 49 24.4 56.6 24.4"
                fill="none"
                stroke="url(#argos-wave)"
                strokeLinecap="round"
                strokeWidth="4"
              />
              <circle cx="18" cy="21" r="4.6" fill="#89fff0" />
              <circle cx="46" cy="43" r="4.6" fill="#2fd4ff" />
            </svg>
          </div>

          <div className="login-brand-copy">
            <p className="login-kicker">ArgosAI Platform</p>
            <h1 className="login-brand-title">Control de Piscifactoría</h1>
            <p>Todo el cultivo en una sola vista.</p>
          </div>

          <ul className="login-brand-tags" aria-label="Capacidades principales">
            <li>Tiempo real</li>
            <li>Alertas</li>
            <li>Trazabilidad</li>
          </ul>
        </section>

        <section className="login-panel" aria-label="Formulario de acceso">
          <h2>Iniciar sesión</h2>
          <p>Accede para continuar.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="tenantCode">Usuario</label>
            <input
              id="tenantCode"
              value={tenantCode}
              onChange={(event) => setTenantCode(event.target.value)}
              autoComplete="username"
              placeholder="demo"
              required
            />

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="admin@argosai.local"
              required
            />

            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />

            <div className="login-form-options">
              <label className="login-remember" htmlFor="rememberPassword">
                <input
                  id="rememberPassword"
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(event) => setRememberPassword(event.target.checked)}
                />
                Guardar contraseña
              </label>

              <button
                type="button"
                className="login-forgot"
                onClick={() => setShowRecoveryHelp((current) => !current)}
              >
                Recuperar contraseña
              </button>
            </div>

            {showRecoveryHelp ? (
              <p className="login-recovery-help">
                Solicítala en <a href={`mailto:${RECOVERY_EMAIL}`}>{RECOVERY_EMAIL}</a>
              </p>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Accediendo..." : "Entrar"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
