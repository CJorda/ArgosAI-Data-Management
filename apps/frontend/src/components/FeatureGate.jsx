import { useAuth } from "../context/AuthContext";

export function FeatureGate({ feature, children }) {
  const { hasFeature, isLoading } = useAuth();

  if (!feature) {
    return children;
  }

  if (isLoading) {
    return <div className="protected-route-state">Cargando sesión...</div>;
  }

  if (!hasFeature(feature)) {
    return (
      <div className="protected-route-state">
        Esta funcionalidad no está incluida en tu plan actual.
      </div>
    );
  }

  return children;
}
