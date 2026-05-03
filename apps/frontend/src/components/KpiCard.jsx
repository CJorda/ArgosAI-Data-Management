import "./KpiCard.css";

export function KpiCard({ label, value, hint }) {
  return (
    <article className="kpi-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </article>
  );
}
