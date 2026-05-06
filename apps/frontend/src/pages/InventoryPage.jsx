import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInventoryItemRequest,
  createInventoryMovementRequest,
  inventoryItemsRequest,
  inventoryMovementsRequest,
  pondsRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

function toDateTimeLocalInput(value = new Date()) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 16);
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function statusClass(movementType) {
  if (movementType === "in") {
    return "module-pill module-pill-status-ready";
  }

  if (movementType === "out") {
    return "module-pill module-pill-priority-high";
  }

  return "module-pill module-pill-status-in_progress";
}

export function InventoryPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [itemForm, setItemForm] = useState({
    sku: "",
    name: "",
    category: "pienso",
    unit: "kg",
    minStock: "",
    currentStock: "",
    location: "",
    supplier: ""
  });

  const [movementForm, setMovementForm] = useState({
    itemId: "",
    movementType: "in",
    quantity: "",
    targetStock: "",
    relatedPondId: "",
    relatedLotCode: "",
    reason: "",
    unitCost: "",
    movedAt: toDateTimeLocalInput()
  });

  const itemsQuery = useQuery({
    queryKey: ["operations", "inventory", "items"],
    queryFn: () => inventoryItemsRequest(accessToken)
  });

  const movementsQuery = useQuery({
    queryKey: ["operations", "inventory", "movements"],
    queryFn: () => inventoryMovementsRequest(accessToken, { limit: 220 })
  });

  const pondsQuery = useQuery({
    queryKey: ["ponds", "inventory"],
    queryFn: () => pondsRequest(accessToken)
  });

  const createItemMutation = useMutation({
    mutationFn: (payload) => createInventoryItemRequest(accessToken, payload),
    onSuccess: () => {
      setItemForm((current) => ({
        ...current,
        sku: "",
        name: "",
        minStock: "",
        currentStock: "",
        location: "",
        supplier: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "inventory", "items"] });
    }
  });

  const createMovementMutation = useMutation({
    mutationFn: (payload) => createInventoryMovementRequest(accessToken, payload),
    onSuccess: () => {
      setMovementForm((current) => ({
        ...current,
        quantity: "",
        targetStock: "",
        relatedLotCode: "",
        reason: "",
        unitCost: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "inventory", "items"] });
      queryClient.invalidateQueries({ queryKey: ["operations", "inventory", "movements"] });
    }
  });

  const items = itemsQuery.data || [];
  const movements = movementsQuery.data || [];

  const lowStockCount = useMemo(
    () => items.filter((item) => Number(item.current_stock) <= Number(item.min_stock)).length,
    [items]
  );

  const handleCreateItem = (event) => {
    event.preventDefault();

    if (!itemForm.sku.trim() || !itemForm.name.trim()) {
      return;
    }

    createItemMutation.mutate({
      sku: itemForm.sku.trim(),
      name: itemForm.name.trim(),
      category: itemForm.category,
      unit: itemForm.unit,
      minStock: itemForm.minStock ? Number(itemForm.minStock) : 0,
      currentStock: itemForm.currentStock ? Number(itemForm.currentStock) : 0,
      location: itemForm.location.trim() || null,
      supplier: itemForm.supplier.trim() || null
    });
  };

  const handleCreateMovement = (event) => {
    event.preventDefault();

    if (!movementForm.itemId || !movementForm.quantity) {
      return;
    }

    createMovementMutation.mutate({
      itemId: Number(movementForm.itemId),
      movementType: movementForm.movementType,
      quantity: Number(movementForm.quantity),
      targetStock:
        movementForm.movementType === "adjustment" && movementForm.targetStock !== ""
          ? Number(movementForm.targetStock)
          : null,
      relatedPondId: movementForm.relatedPondId ? Number(movementForm.relatedPondId) : null,
      relatedLotCode: movementForm.relatedLotCode.trim() || null,
      reason: movementForm.reason.trim() || null,
      unitCost: movementForm.unitCost ? Number(movementForm.unitCost) : null,
      movedAt: toIsoOrNull(movementForm.movedAt)
    });
  };

  return (
    <section className="module-page">
      <article className="panel">
        <h3>Gestión de inventario operativo</h3>
        <p className="module-intro">
          Controla stock mínimo, entradas/salidas y ajustes de inventario con trazabilidad por
          piscina y lote para evitar roturas en operación diaria.
        </p>
        <p className="module-inline-note">
          Ítems totales: {items.length} | Riesgo de quiebre de stock: {lowStockCount}
        </p>
      </article>

      <div className="module-grid">
        <article className="panel">
          <h3>Nuevo ítem de inventario</h3>
          <form className="stack-form" onSubmit={handleCreateItem}>
            <label htmlFor="invSku">SKU</label>
            <input
              id="invSku"
              type="text"
              value={itemForm.sku}
              onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))}
              placeholder="Ej. PIENSO-3MM"
              required
            />

            <label htmlFor="invName">Nombre</label>
            <input
              id="invName"
              type="text"
              value={itemForm.name}
              onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
              required
            />

            <label htmlFor="invCategory">Categoría</label>
            <input
              id="invCategory"
              type="text"
              value={itemForm.category}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, category: event.target.value }))
              }
            />

            <label htmlFor="invUnit">Unidad</label>
            <select
              id="invUnit"
              value={itemForm.unit}
              onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))}
            >
              <option value="kg">kg</option>
              <option value="units">units</option>
              <option value="L">L</option>
              <option value="packs">packs</option>
              <option value="boxes">boxes</option>
            </select>

            <label htmlFor="invMinStock">Stock mínimo</label>
            <input
              id="invMinStock"
              type="number"
              min="0"
              step="0.01"
              value={itemForm.minStock}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, minStock: event.target.value }))
              }
            />

            <label htmlFor="invCurrentStock">Stock inicial</label>
            <input
              id="invCurrentStock"
              type="number"
              min="0"
              step="0.01"
              value={itemForm.currentStock}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, currentStock: event.target.value }))
              }
            />

            <label htmlFor="invLocation">Ubicación</label>
            <input
              id="invLocation"
              type="text"
              value={itemForm.location}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, location: event.target.value }))
              }
              placeholder="Almacén principal"
            />

            <label htmlFor="invSupplier">Proveedor</label>
            <input
              id="invSupplier"
              type="text"
              value={itemForm.supplier}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, supplier: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={createItemMutation.isPending}>
              {createItemMutation.isPending ? "Guardando..." : "Crear ítem"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Registrar movimiento</h3>
          <form className="stack-form" onSubmit={handleCreateMovement}>
            <label htmlFor="movItem">Ítem</label>
            <select
              id="movItem"
              value={movementForm.itemId}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, itemId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name}
                </option>
              ))}
            </select>

            <label htmlFor="movType">Tipo</label>
            <select
              id="movType"
              value={movementForm.movementType}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, movementType: event.target.value }))
              }
            >
              <option value="in">Entrada</option>
              <option value="out">Salida</option>
              <option value="adjustment">Ajuste</option>
            </select>

            <label htmlFor="movQty">Cantidad</label>
            <input
              id="movQty"
              type="number"
              min="0.01"
              step="0.01"
              value={movementForm.quantity}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, quantity: event.target.value }))
              }
              required
            />

            {movementForm.movementType === "adjustment" ? (
              <>
                <label htmlFor="movTargetStock">Stock objetivo</label>
                <input
                  id="movTargetStock"
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementForm.targetStock}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, targetStock: event.target.value }))
                  }
                  required
                />
              </>
            ) : null}

            <label htmlFor="movPond">Piscina relacionada</label>
            <select
              id="movPond"
              value={movementForm.relatedPondId}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, relatedPondId: event.target.value }))
              }
            >
              <option value="">Sin asociación</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="movLot">Lote relacionado</label>
            <input
              id="movLot"
              type="text"
              value={movementForm.relatedLotCode}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, relatedLotCode: event.target.value }))
              }
              placeholder="LOT-X..."
            />

            <label htmlFor="movReason">Motivo</label>
            <input
              id="movReason"
              type="text"
              value={movementForm.reason}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="Consumo diario, compra, ajuste inventario..."
            />

            <label htmlFor="movUnitCost">Coste unitario (€)</label>
            <input
              id="movUnitCost"
              type="number"
              min="0"
              step="0.0001"
              value={movementForm.unitCost}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, unitCost: event.target.value }))
              }
            />

            <label htmlFor="movDate">Fecha del movimiento</label>
            <input
              id="movDate"
              type="datetime-local"
              value={movementForm.movedAt}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, movedAt: event.target.value }))
              }
            />

            <button
              type="submit"
              className="primary-button"
              disabled={createMovementMutation.isPending || items.length === 0}
            >
              {createMovementMutation.isPending ? "Guardando..." : "Registrar movimiento"}
            </button>
          </form>
        </article>
      </div>

      <article className="panel">
        <h3>Estado de inventario</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Ítem</th>
                <th>Categoría</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Ubicación</th>
                <th>Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item) => {
                  const isLow = Number(item.current_stock) <= Number(item.min_stock);
                  return (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td className={isLow ? "module-warning" : ""}>
                        {item.current_stock} {item.unit}
                      </td>
                      <td>{item.min_stock} {item.unit}</td>
                      <td>{item.location || "-"}</td>
                      <td>{item.supplier || "-"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-text">No hay ítems de inventario registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Historial de movimientos</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ítem</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.length > 0 ? (
                movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.moved_at).toLocaleString()}</td>
                    <td>{movement.sku} - {movement.item_name}</td>
                    <td>
                      <span className={statusClass(movement.movement_type)}>{movement.movement_type}</span>
                    </td>
                    <td>{movement.quantity} {movement.unit}</td>
                    <td>{movement.pond_name || "-"}</td>
                    <td>{movement.related_lot_code || "-"}</td>
                    <td>{movement.reason || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-text">No hay movimientos de inventario.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
