import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPondRequest,
  pondsRequest,
  resolveScadaUnmappedSignalRequest,
  scadaUnmappedSignalsRequest,
  sitesRequest,
  updatePondMappingRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./PondsCatalogPage.css";

function extractApiErrorMessage(error, fallbackMessage) {
  const apiMessage = error?.response?.data?.message;
  if (apiMessage && String(apiMessage).trim()) {
    return String(apiMessage).trim();
  }

  const fieldErrors = error?.response?.data?.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    const firstField = Object.keys(fieldErrors)[0];
    const firstMessage = firstField ? fieldErrors[firstField]?.[0] : null;
    if (firstMessage) {
      return String(firstMessage);
    }
  }

  return fallbackMessage;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function PondsCatalogPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState("");
  const [formState, setFormState] = useState({
    name: "",
    externalCode: "",
    species: "",
    siteId: "",
    volumeM3: ""
  });
  const [mappingDrafts, setMappingDrafts] = useState({});
  const [resolveDrafts, setResolveDrafts] = useState({});

  const pondsQuery = useQuery({
    queryKey: ["ponds", "catalog"],
    queryFn: () => pondsRequest(accessToken)
  });

  const sitesQuery = useQuery({
    queryKey: ["sites", "catalog"],
    queryFn: () => sitesRequest(accessToken)
  });

  const unmappedSignalsQuery = useQuery({
    queryKey: ["scada", "unmapped-signals"],
    queryFn: () => scadaUnmappedSignalsRequest(accessToken),
    refetchInterval: 15000
  });

  const createPondMutation = useMutation({
    mutationFn: (payload) => createPondRequest(accessToken, payload),
    onSuccess: () => {
      setFormError("");
      setFormState({
        name: "",
        externalCode: "",
        species: "",
        siteId: "",
        volumeM3: ""
      });
      queryClient.invalidateQueries({ queryKey: ["ponds"] });
    },
    onError: (error) => {
      setFormError(extractApiErrorMessage(error, "No se pudo crear la piscina."));
    }
  });

  const ponds = useMemo(() => pondsQuery.data || [], [pondsQuery.data]);
  const sites = useMemo(() => sitesQuery.data || [], [sitesQuery.data]);

  const updateMappingMutation = useMutation({
    mutationFn: ({ pondId, externalCode }) =>
      updatePondMappingRequest(accessToken, pondId, {
        externalCode: externalCode ? String(externalCode).trim().toUpperCase() : null
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ponds"] });
    }
  });

  const resolveSignalMutation = useMutation({
    mutationFn: ({ signalId, pondId }) =>
      resolveScadaUnmappedSignalRequest(accessToken, signalId, { pondId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ponds"] });
      queryClient.invalidateQueries({ queryKey: ["scada", "unmapped-signals"] });
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormError("");

    const name = formState.name.trim();
    const species = formState.species.trim();

    if (name.length < 2) {
      setFormError("El nombre de la piscina debe tener al menos 2 caracteres.");
      return;
    }

    if (species.length < 2) {
      setFormError("La especie debe tener al menos 2 caracteres.");
      return;
    }

    const payload = {
      name,
      externalCode: formState.externalCode ? formState.externalCode.trim().toUpperCase() : null,
      species,
      siteId: formState.siteId ? Number(formState.siteId) : null,
      volumeM3: formState.volumeM3 ? Number(formState.volumeM3) : null
    };

    createPondMutation.mutate(payload);
  };

  return (
    <section className="pond-catalog-page">
      <header className="pond-catalog-header panel">
        <div>
          <h1>Gestión de piscinas</h1>
          <p>
            Alta rápida para nuevos clientes: define el nombre de cada piscina y queda disponible
            en operaciones, trazabilidad y analítica.
          </p>
        </div>
      </header>

      <div className="pond-catalog-grid">
        <article className="pond-catalog-card panel">
          <h2>Crear piscina</h2>
          <form className="pond-catalog-form" onSubmit={handleSubmit}>
            <label htmlFor="pondName">Nombre de piscina</label>
            <input
              id="pondName"
              value={formState.name}
              onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ej: Piscina A1"
              minLength={2}
              required
            />

            <label htmlFor="pondSpecies">Especie</label>
            <input
              id="pondSpecies"
              value={formState.species}
              onChange={(event) => setFormState((current) => ({ ...current, species: event.target.value }))}
              placeholder="Ej: Dorada"
              minLength={2}
              required
            />

            <label htmlFor="pondExternalCode">Código técnico SCADA (opcional)</label>
            <input
              id="pondExternalCode"
              value={formState.externalCode}
              onChange={(event) =>
                setFormState((current) => ({ ...current, externalCode: event.target.value }))
              }
              placeholder="Ej: F1, D7, PISCINA_12"
            />

            <label htmlFor="pondSite">Centro (opcional)</label>
            <select
              id="pondSite"
              value={formState.siteId}
              onChange={(event) => setFormState((current) => ({ ...current, siteId: event.target.value }))}
            >
              <option value="">Sin centro</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>

            <label htmlFor="pondVolume">Volumen m3 (opcional)</label>
            <input
              id="pondVolume"
              type="number"
              min="0"
              step="0.01"
              value={formState.volumeM3}
              onChange={(event) => setFormState((current) => ({ ...current, volumeM3: event.target.value }))}
              placeholder="Ej: 850"
            />

            {formError ? <p className="pond-catalog-error">{formError}</p> : null}

            <button type="submit" disabled={createPondMutation.isPending}>
              {createPondMutation.isPending ? "Guardando..." : "Guardar piscina"}
            </button>
          </form>
        </article>

        <article className="pond-catalog-card panel">
          <h2>Piscinas registradas</h2>

          {pondsQuery.isLoading ? <p>Cargando piscinas...</p> : null}
          {pondsQuery.isError ? (
            <p className="pond-catalog-error">
              {extractApiErrorMessage(pondsQuery.error, "No se pudo cargar el listado de piscinas.")}
            </p>
          ) : null}

          {!pondsQuery.isLoading && !pondsQuery.isError ? (
            <div className="pond-catalog-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Especie</th>
                    <th>Centro</th>
                    <th>Volumen</th>
                    <th>Alta</th>
                    <th>Código SCADA</th>
                  </tr>
                </thead>
                <tbody>
                  {ponds.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No hay piscinas registradas todavía.</td>
                    </tr>
                  ) : (
                    ponds.map((pond) => (
                      <tr key={pond.id}>
                        <td>{pond.name}</td>
                        <td>{pond.species || "-"}</td>
                        <td>{pond.site_name || "-"}</td>
                        <td>
                          {Number.isFinite(Number(pond.volume_m3))
                            ? `${Number(pond.volume_m3).toLocaleString("es-ES")} m3`
                            : "-"}
                        </td>
                        <td>{formatDate(pond.created_at)}</td>
                        <td>
                          <div className="pond-catalog-mapping-cell">
                            <input
                              value={
                                Object.prototype.hasOwnProperty.call(mappingDrafts, pond.id)
                                  ? mappingDrafts[pond.id]
                                  : pond.external_code || ""
                              }
                              onChange={(event) =>
                                setMappingDrafts((current) => ({
                                  ...current,
                                  [pond.id]: event.target.value
                                }))
                              }
                              placeholder="Sin código"
                            />
                            <button
                              type="button"
                              disabled={updateMappingMutation.isPending}
                              onClick={() => {
                                const draftValue = Object.prototype.hasOwnProperty.call(
                                  mappingDrafts,
                                  pond.id
                                )
                                  ? mappingDrafts[pond.id]
                                  : pond.external_code || "";

                                updateMappingMutation.mutate({
                                  pondId: pond.id,
                                  externalCode: draftValue
                                });
                              }}
                            >
                              Guardar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {updateMappingMutation.isError ? (
            <p className="pond-catalog-error">
              {extractApiErrorMessage(
                updateMappingMutation.error,
                "No se pudo actualizar el código técnico SCADA."
              )}
            </p>
          ) : null}
        </article>

        <article className="pond-catalog-card panel">
          <h2>Señales SCADA sin mapear</h2>
          <p className="pond-catalog-subtext">
            Si llega una señal con código externo no asociado, aparecerá aquí para resolverla en
            un clic.
          </p>

          {unmappedSignalsQuery.isLoading ? <p>Cargando señales pendientes...</p> : null}
          {unmappedSignalsQuery.isError ? (
            <p className="pond-catalog-error">
              {extractApiErrorMessage(
                unmappedSignalsQuery.error,
                "No se pudieron cargar las señales SCADA no mapeadas."
              )}
            </p>
          ) : null}

          {!unmappedSignalsQuery.isLoading && !unmappedSignalsQuery.isError ? (
            <div className="pond-catalog-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código externo</th>
                    <th>Tipo sensor</th>
                    <th>Muestras</th>
                    <th>Última vez</th>
                    <th>Resolver</th>
                  </tr>
                </thead>
                <tbody>
                  {(unmappedSignalsQuery.data || []).length === 0 ? (
                    <tr>
                      <td colSpan={5}>No hay señales sin mapear.</td>
                    </tr>
                  ) : (
                    (unmappedSignalsQuery.data || []).map((signal) => {
                      const selectedPondId = Object.prototype.hasOwnProperty.call(
                        resolveDrafts,
                        signal.id
                      )
                        ? resolveDrafts[signal.id]
                        : "";

                      return (
                        <tr key={`unmapped-${signal.id}`}>
                          <td>{signal.external_code || signal.externalCode}</td>
                          <td>{signal.sensor_type || signal.sensorType}</td>
                          <td>{signal.samples_count ?? signal.samplesCount ?? 1}</td>
                          <td>{formatDate(signal.last_seen_at || signal.lastSeenAt)}</td>
                          <td>
                            <div className="pond-catalog-mapping-cell">
                              <select
                                value={selectedPondId}
                                onChange={(event) =>
                                  setResolveDrafts((current) => ({
                                    ...current,
                                    [signal.id]: event.target.value
                                  }))
                                }
                              >
                                <option value="">Seleccionar piscina</option>
                                {ponds.map((pond) => (
                                  <option key={`resolve-pond-${pond.id}`} value={pond.id}>
                                    {pond.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={
                                  resolveSignalMutation.isPending ||
                                  !selectedPondId ||
                                  !Number(selectedPondId)
                                }
                                onClick={() => {
                                  resolveSignalMutation.mutate({
                                    signalId: signal.id,
                                    pondId: Number(selectedPondId)
                                  });
                                }}
                              >
                                Vincular
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {resolveSignalMutation.isError ? (
            <p className="pond-catalog-error">
              {extractApiErrorMessage(
                resolveSignalMutation.error,
                "No se pudo resolver la señal SCADA seleccionada."
              )}
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
