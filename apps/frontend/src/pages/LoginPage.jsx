import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const [tenantCode, setTenantCode] = useState("demo");
  const [email, setEmail] = useState("admin@argosai.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    const target = location.state?.from?.pathname || "/dashboard";
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ tenantCode, email, password });
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
            <h1>ArgosAI Piscifactoría</h1>
            <p>
              Supervisa sensores en tiempo real, detecta alertas antes y toma decisiones con
              datos operativos claros.
            </p>
          </div>

          <ul className="login-highlights" aria-label="Capacidades principales">
            <li>Monitoreo continuo de temperatura, oxígeno y salinidad.</li>
            <li>Alertas accionables para reducir riesgo operativo.</li>
            <li>Historial y reportes para mejorar la trazabilidad.</li>
          </ul>
        </section>

        <section className="login-panel" aria-label="Formulario de acceso">
          <h2>Iniciar sesión</h2>
          <p>Accede con tus credenciales para entrar al panel de gestión.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="tenant">Tenant</label>
            <input
              id="tenant"
              value={tenantCode}
              onChange={(event) => setTenantCode(event.target.value)}
              required
            />

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

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
