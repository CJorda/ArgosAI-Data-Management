import bcrypt from "bcryptjs";
import { logger } from "../config/logger.js";
import { pool, query } from "./pool.js";

const tenantCode = "demo";
const tenantName = "Piscifactoria Demo";
const adminEmail = "admin@argosai.local";
const adminPassword = "Admin123!";

const dayMs = 24 * 3600 * 1000;

const pondZones = [
  { prefix: "F", count: 10, species: "dorada" },
  { prefix: "E", count: 12, species: "lubina" },
  { prefix: "D", count: 12, species: "trucha" },
  { prefix: "A", count: 4, species: "dorada" },
  { prefix: "B", count: 4, species: "lubina" },
  { prefix: "C", count: 7, species: "trucha" }
];

const oxygenSetpointZoneGroups = [
  {
    slotCodes: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]
  },
  {
    slotCodes: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"]
  },
  {
    slotCodes: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12"]
  },
  {
    slotCodes: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]
  }
];

const oxygenSetpointNoConfigSlots = new Set(["C2", "C6", "D11", "D12", "E8", "E11", "E12", "F7", "F9", "F10"]);

const sensorTemplates = [
  { type: "temperature", unit: "C", label: "Temperatura" },
  { type: "oxygen", unit: "mg/L", label: "Oxigeno" },
  { type: "salinity", unit: "ppt", label: "Salinidad" },
  { type: "ph", unit: "pH", label: "pH" },
  { type: "turbidity", unit: "NTU", label: "Turbidez" }
];

const defaultRules = [
  { sensorType: "oxygen", minValue: 6, maxValue: null, severity: "high" },
  { sensorType: "temperature", minValue: 12, maxValue: 24, severity: "medium" },
  { sensorType: "ph", minValue: 7, maxValue: 8.2, severity: "medium" },
  { sensorType: "salinity", minValue: 29, maxValue: 38, severity: "low" }
];

const feedTableSeeds = [
  { species: "dorada", minWeightG: 1, maxWeightG: 80, dailyFeedPct: 2.1, fcrTarget: 1.05 },
  { species: "dorada", minWeightG: 80, maxWeightG: 250, dailyFeedPct: 1.6, fcrTarget: 1.15 },
  { species: "dorada", minWeightG: 250, maxWeightG: 1200, dailyFeedPct: 1.1, fcrTarget: 1.3 },
  { species: "lubina", minWeightG: 1, maxWeightG: 100, dailyFeedPct: 2.3, fcrTarget: 1.1 },
  { species: "lubina", minWeightG: 100, maxWeightG: 300, dailyFeedPct: 1.8, fcrTarget: 1.2 },
  { species: "lubina", minWeightG: 300, maxWeightG: 1400, dailyFeedPct: 1.2, fcrTarget: 1.35 },
  { species: "trucha", minWeightG: 1, maxWeightG: 120, dailyFeedPct: 2.4, fcrTarget: 0.95 },
  { species: "trucha", minWeightG: 120, maxWeightG: 350, dailyFeedPct: 1.9, fcrTarget: 1.05 },
  { species: "trucha", minWeightG: 350, maxWeightG: 2200, dailyFeedPct: 1.3, fcrTarget: 1.2 }
];

const biomassSnapshotDays = [110, 90, 70, 50, 30, 14, 4];
const operationFeedDays = [28, 21, 14, 9, 6, 3, 1];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

function toIsoDaysAgo(days, preferredHour = 10) {
  const date = new Date(Date.now() - days * dayMs);
  date.setUTCHours(preferredHour, randomInt(0, 59), randomInt(0, 59), 0);
  return date.toISOString();
}

function estimatePondVolumeM3(code) {
  const normalized = String(code || "").toUpperCase();
  const prefix = normalized.charAt(0);
  const index = Number(normalized.slice(1));
  const baseByZone = {
    A: 650,
    B: 700,
    C: 760,
    D: 980,
    E: 1100,
    F: 900
  };

  const base = baseByZone[prefix];
  const safeIndex = Number.isFinite(index) && index > 0 ? index : 1;

  if (!Number.isFinite(base)) {
    return 700;
  }

  return Number((base + safeIndex * 6).toFixed(1));
}

function oxygenColorThresholds(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = Number(String(slotCode || "").replace(/[^0-9]/g, "")) || 1;
  const zoneOffset = {
    A: 0,
    B: 0.08,
    C: 0.12,
    D: 0.2,
    E: 0.28,
    F: 0.16
  }[prefix] ?? 0;
  const criticalValue = Number((4.6 + zoneOffset + (index % 3) * 0.07).toFixed(2));
  const lowValue = Number((criticalValue + 1.3 + (index % 4) * 0.05).toFixed(2));
  const highValue = Number((lowValue + 2.1 + (index % 5) * 0.04).toFixed(2));

  return {
    criticalValue,
    lowValue,
    highValue
  };
}

function temperatureColorThresholds(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = Number(String(slotCode || "").replace(/[^0-9]/g, "")) || 1;
  const zoneOffset = {
    A: 0.2,
    B: 0.3,
    C: 0.4,
    D: 0.6,
    E: 0.8,
    F: 0.5
  }[prefix] ?? 0.3;

  const criticalValue = Number((27.4 + zoneOffset + (index % 3) * 0.2).toFixed(2));
  const highValue = Number((criticalValue - 3.1 - (index % 4) * 0.15).toFixed(2));
  const lowValue = Number((highValue - 5.4 - (index % 5) * 0.18).toFixed(2));

  return {
    criticalValue,
    highValue,
    lowValue
  };
}

function phoneAlertThresholds(slotCode) {
  const index = Number(String(slotCode || "").replace(/[^0-9]/g, "")) || 1;
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const oxygenMinBase = {
    A: 36,
    B: 37,
    C: 38,
    D: 39,
    E: 40,
    F: 38
  }[prefix] ?? 37;
  const oxygenMaxBase = {
    A: 88,
    B: 89,
    C: 90,
    D: 91,
    E: 92,
    F: 90
  }[prefix] ?? 89;
  const temperatureMaxBase = {
    A: 26.2,
    B: 26.4,
    C: 26.6,
    D: 26.9,
    E: 27.1,
    F: 26.8
  }[prefix] ?? 26.5;

  return {
    oxygenMinPct: Number((oxygenMinBase + (index % 3) * 0.7).toFixed(2)),
    oxygenMaxPct: Number((oxygenMaxBase + (index % 4) * 0.6).toFixed(2)),
    temperatureMaxC: Number((temperatureMaxBase + (index % 4) * 0.18).toFixed(2))
  };
}

function smsAlertThresholds(slotCode) {
  const index = Number(String(slotCode || "").replace(/[^0-9]/g, "")) || 1;
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const oxygenMinBase = {
    A: 35,
    B: 36,
    C: 37,
    D: 38,
    E: 39,
    F: 37
  }[prefix] ?? 36;
  const oxygenMaxBase = {
    A: 86,
    B: 87,
    C: 88,
    D: 89,
    E: 90,
    F: 88
  }[prefix] ?? 87;
  const temperatureMaxBase = {
    A: 25.9,
    B: 26.1,
    C: 26.3,
    D: 26.6,
    E: 26.8,
    F: 26.5
  }[prefix] ?? 26.1;

  return {
    oxygenMinPct: Number((oxygenMinBase + (index % 4) * 0.65).toFixed(2)),
    oxygenMaxPct: Number((oxygenMaxBase + (index % 3) * 0.55).toFixed(2)),
    temperatureMaxC: Number((temperatureMaxBase + (index % 5) * 0.16).toFixed(2))
  };
}

function buildPondSeeds() {
  const seeds = [];

  for (const zone of pondZones) {
    for (let index = 1; index <= zone.count; index += 1) {
      const code = `${zone.prefix}${index}`;
      seeds.push({
        code,
        name: `Piscina ${code}`,
        species: zone.species,
        volumeM3: estimatePondVolumeM3(code)
      });
    }
  }

  return seeds;
}

function lotCode(code, batch) {
  return `LOT-${code}-${batch}`;
}

function zoneTag(code) {
  return `zona-${String(code).charAt(0).toLowerCase()}`;
}

async function seed() {
  await query("BEGIN");

  try {
    await query("DELETE FROM tenants WHERE code = $1", [tenantCode]);

    const tenantResult = await query(
      `
        INSERT INTO tenants (code, name)
        VALUES ($1, $2)
        RETURNING id
      `,
      [tenantCode, tenantName]
    );

    const tenantId = tenantResult.rows[0].id;
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const userResult = await query(
      `
        INSERT INTO users (tenant_id, email, full_name, password_hash, role)
        VALUES ($1, $2, 'Admin Demo', $3, 'admin')
        RETURNING id
      `,
      [tenantId, adminEmail, passwordHash]
    );

    const userId = userResult.rows[0].id;
    const pondSeeds = buildPondSeeds();
    const pondByCode = new Map();
    const sensorByCodeType = new Map();
    const ruleIdByType = new Map();
    let measurementsInserted = 0;
    let biomassCount = 0;
    let operationsCount = 0;
    let alertsCount = 0;
    let oxygenSetpointsCount = 0;
    let oxygenColorSetpointsCount = 0;
    let temperatureColorSetpointsCount = 0;
    let phoneAlertSetpointsCount = 0;
    let smsAlertSetpointsCount = 0;

    for (const pond of pondSeeds) {
      const pondResult = await query(
        `
          INSERT INTO ponds (tenant_id, name, species, volume_m3)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [tenantId, pond.name, pond.species, pond.volumeM3]
      );

      pondByCode.set(pond.code, {
        id: pondResult.rows[0].id,
        code: pond.code,
        species: pond.species,
        name: pond.name
      });
    }

    for (const pond of pondSeeds) {
      const pondState = pondByCode.get(pond.code);

      for (const template of sensorTemplates) {
        const sensorResult = await query(
          `
            INSERT INTO sensors (tenant_id, pond_id, name, type, unit)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `,
          [tenantId, pondState.id, `${template.label} ${pond.code}`, template.type, template.unit]
        );

        sensorByCodeType.set(`${pond.code}:${template.type}`, sensorResult.rows[0].id);
      }
    }

    for (const rule of defaultRules) {
      const ruleResult = await query(
        `
          INSERT INTO alert_rules (tenant_id, pond_id, sensor_type, min_value, max_value, severity, enabled)
          VALUES ($1, NULL, $2, $3, $4, $5, TRUE)
          RETURNING id
        `,
        [tenantId, rule.sensorType, rule.minValue, rule.maxValue, rule.severity]
      );

      ruleIdByType.set(rule.sensorType, ruleResult.rows[0].id);
    }

    for (const item of feedTableSeeds) {
      await query(
        `
          INSERT INTO feed_tables (
            tenant_id,
            species,
            min_weight_g,
            max_weight_g,
            daily_feed_pct,
            fcr_target
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          tenantId,
          item.species,
          item.minWeightG,
          item.maxWeightG,
          item.dailyFeedPct,
          item.fcrTarget
        ]
      );
    }

    const oxygenSetpointSlotCodes = oxygenSetpointZoneGroups.flatMap((group) => group.slotCodes);

    for (const slotCode of oxygenSetpointSlotCodes) {
      const hasSetpoint = !oxygenSetpointNoConfigSlots.has(slotCode);
      const updatedAt = toIsoDaysAgo(hasSetpoint ? randomInt(0, 2) : randomInt(6, 12), randomInt(6, 20));
      const oxygenColor = oxygenColorThresholds(slotCode);
      const temperatureColor = temperatureColorThresholds(slotCode);
      const phoneThresholds = phoneAlertThresholds(slotCode);
      const smsThresholds = smsAlertThresholds(slotCode);
      const phoneEnabled = !["C2", "D11", "F9"].includes(slotCode);
      const smsEnabled = !["B4", "E12", "F10"].includes(slotCode);

      await query(
        `
          INSERT INTO oxygen_valve_setpoints (
            tenant_id,
            slot_code,
            activation_enabled,
            setpoint_on_pct,
            setpoint_off_pct,
            updated_at
          )
          VALUES ($1, $2, FALSE, $3, $4, $5::timestamptz)
        `,
        [
          tenantId,
          slotCode,
          hasSetpoint ? 0 : null,
          hasSetpoint ? 1 : null,
          updatedAt
        ]
      );

      oxygenSetpointsCount += 1;

      await query(
        `
          INSERT INTO oxygen_color_setpoints (
            tenant_id,
            slot_code,
            critical_value,
            low_value,
            high_value,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        `,
        [
          tenantId,
          slotCode,
          oxygenColor.criticalValue,
          oxygenColor.lowValue,
          oxygenColor.highValue,
          updatedAt
        ]
      );

      oxygenColorSetpointsCount += 1;

      await query(
        `
          INSERT INTO temperature_color_setpoints (
            tenant_id,
            slot_code,
            critical_value,
            high_value,
            low_value,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        `,
        [
          tenantId,
          slotCode,
          temperatureColor.criticalValue,
          temperatureColor.highValue,
          temperatureColor.lowValue,
          updatedAt
        ]
      );

      temperatureColorSetpointsCount += 1;

      await query(
        `
          INSERT INTO phone_alert_setpoints (
            tenant_id,
            slot_code,
            enabled,
            oxygen_min_pct,
            oxygen_max_pct,
            temperature_max_c,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
        `,
        [
          tenantId,
          slotCode,
          phoneEnabled,
          phoneThresholds.oxygenMinPct,
          phoneThresholds.oxygenMaxPct,
          phoneThresholds.temperatureMaxC,
          updatedAt
        ]
      );

      phoneAlertSetpointsCount += 1;

      await query(
        `
          INSERT INTO sms_alert_setpoints (
            tenant_id,
            slot_code,
            enabled,
            oxygen_min_pct,
            oxygen_max_pct,
            temperature_max_c,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
        `,
        [
          tenantId,
          slotCode,
          smsEnabled,
          smsThresholds.oxygenMinPct,
          smsThresholds.oxygenMaxPct,
          smsThresholds.temperatureMaxC,
          updatedAt
        ]
      );

      smsAlertSetpointsCount += 1;
    }

    for (let pondIndex = 0; pondIndex < pondSeeds.length; pondIndex += 1) {
      const pond = pondSeeds[pondIndex];
      const pondState = pondByCode.get(pond.code);
      const firstLot = lotCode(pond.code, "A");
      const secondLot = lotCode(pond.code, "B");
      const zoneOffset = (pond.code.charCodeAt(0) - 65) * 35 + Number(pond.code.slice(1)) * 4;
      const baseFishCount = Math.max(2200, randomInt(4300, 6700) - zoneOffset);

      for (let snapIndex = 0; snapIndex < biomassSnapshotDays.length; snapIndex += 1) {
        const daysAgo = biomassSnapshotDays[snapIndex];
        const fishCount = Math.max(1600, baseFishCount - snapIndex * randomInt(90, 170));
        const avgWeightG = randomFloat(55 + snapIndex * 52, 80 + snapIndex * 62, 1);
        const biomassKg = (fishCount * avgWeightG) / 1000;
        const feedKg = randomFloat(Math.max(50, biomassKg * 0.085), Math.max(85, biomassKg * 0.14), 2);
        const fcr = randomFloat(0.92, 1.44, 3);
        const mortalityPct = randomFloat(0.7 + snapIndex * 0.15, 1.5 + snapIndex * 0.23, 2);
        const vaccinationCoveragePct = randomFloat(82, 98, 2);
        const withdrawalDaysRemaining =
          pond.code.startsWith("C") && snapIndex >= biomassSnapshotDays.length - 2
            ? randomInt(3, 18)
            : null;

        await query(
          `
            INSERT INTO biomass_entries (
              tenant_id,
              pond_id,
              species_variant,
              lot_code,
              fish_count,
              avg_weight_g,
              mortality_pct,
              vaccination_coverage_pct,
              withdrawal_days_remaining,
              feed_kg,
              fcr,
              captured_at,
              created_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12::timestamptz,
              $12::timestamptz
            )
          `,
          [
            tenantId,
            pondState.id,
            pond.species,
            snapIndex < 4 ? firstLot : secondLot,
            fishCount,
            avgWeightG,
            mortalityPct,
            vaccinationCoveragePct,
            withdrawalDaysRemaining,
            feedKg,
            fcr,
            toIsoDaysAgo(daysAgo, 8 + (snapIndex % 7))
          ]
        );

        biomassCount += 1;
      }

      for (const daysAgo of operationFeedDays) {
        const eventAt = toIsoDaysAgo(daysAgo, 10);

        await query(
          `
            INSERT INTO operations (
              tenant_id,
              pond_id,
              type,
              quantity,
              quantity_unit,
              lot_code,
              mix_with_lot_code,
              label_tags,
              withdrawal_days,
              withdrawal_until,
              event_at,
              note,
              created_by,
              created_at
            )
            VALUES (
              $1,
              $2,
              'feeding',
              $3,
              'kg',
              $4,
              NULL,
              $5::text[],
              NULL,
              NULL,
              $6::timestamptz,
              $7,
              $8,
              $6::timestamptz
            )
          `,
          [
            tenantId,
            pondState.id,
            randomFloat(45, 185, 2),
            daysAgo > 10 ? firstLot : secondLot,
            ["demo", zoneTag(pond.code), "alimentacion"],
            eventAt,
            `Racion diaria ${pond.code}`,
            userId
          ]
        );

        operationsCount += 1;
      }

      const maintenanceAt = toIsoDaysAgo(16, 11);
      await query(
        `
          INSERT INTO operations (
            tenant_id,
            pond_id,
            type,
            quantity,
            quantity_unit,
            lot_code,
            mix_with_lot_code,
            label_tags,
            withdrawal_days,
            withdrawal_until,
            event_at,
            note,
            created_by,
            created_at
          )
          VALUES (
            $1,
            $2,
            'maintenance',
            $3,
            'units',
            NULL,
            NULL,
            $4::text[],
            NULL,
            NULL,
            $5::timestamptz,
            $6,
            $7,
            $5::timestamptz
          )
        `,
        [
          tenantId,
          pondState.id,
          randomInt(1, 3),
          ["demo", zoneTag(pond.code), "mantenimiento"],
          maintenanceAt,
          `Revision programada de compuertas en ${pond.code}`,
          userId
        ]
      );
      operationsCount += 1;

      const cleaningAt = toIsoDaysAgo(11, 9);
      await query(
        `
          INSERT INTO operations (
            tenant_id,
            pond_id,
            type,
            quantity,
            quantity_unit,
            lot_code,
            mix_with_lot_code,
            label_tags,
            withdrawal_days,
            withdrawal_until,
            event_at,
            note,
            created_by,
            created_at
          )
          VALUES (
            $1,
            $2,
            'cleaning',
            1,
            'units',
            NULL,
            NULL,
            $3::text[],
            NULL,
            NULL,
            $4::timestamptz,
            $5,
            $6,
            $4::timestamptz
          )
        `,
        [
          tenantId,
          pondState.id,
          ["demo", zoneTag(pond.code), "limpieza"],
          cleaningAt,
          `Limpieza interior y retirada de sedimentos en ${pond.code}`,
          userId
        ]
      );
      operationsCount += 1;

      const transferAt = toIsoDaysAgo(33, 12);
      await query(
        `
          INSERT INTO operations (
            tenant_id,
            pond_id,
            type,
            quantity,
            quantity_unit,
            lot_code,
            mix_with_lot_code,
            label_tags,
            withdrawal_days,
            withdrawal_until,
            event_at,
            note,
            created_by,
            created_at
          )
          VALUES (
            $1,
            $2,
            'transfer',
            $3,
            'units',
            $4,
            $5,
            $6::text[],
            NULL,
            NULL,
            $7::timestamptz,
            $8,
            $9,
            $7::timestamptz
          )
        `,
        [
          tenantId,
          pondState.id,
          randomInt(110, 280),
          secondLot,
          firstLot,
          ["demo", zoneTag(pond.code), "traslado"],
          transferAt,
          `Traslado parcial entre lotes ${firstLot} -> ${secondLot}`,
          userId
        ]
      );
      operationsCount += 1;

      if (pondIndex % 4 === 0) {
        const treatmentRecent = pondIndex % 8 === 0;
        const treatmentDaysAgo = treatmentRecent ? 2 : 20;
        const withdrawalDays = treatmentRecent ? 14 : 7;
        const eventAtIso = toIsoDaysAgo(treatmentDaysAgo, 13);
        const withdrawalUntil = new Date(
          new Date(eventAtIso).getTime() + withdrawalDays * dayMs
        ).toISOString();

        await query(
          `
            INSERT INTO operations (
              tenant_id,
              pond_id,
              type,
              quantity,
              quantity_unit,
              lot_code,
              mix_with_lot_code,
              label_tags,
              withdrawal_days,
              withdrawal_until,
              event_at,
              note,
              created_by,
              created_at
            )
            VALUES (
              $1,
              $2,
              'treatment',
              $3,
              'kg',
              $4,
              NULL,
              $5::text[],
              $6,
              $7::timestamptz,
              $8::timestamptz,
              $9,
              $10,
              $8::timestamptz
            )
          `,
          [
            tenantId,
            pondState.id,
            randomFloat(3, 11, 2),
            secondLot,
            ["demo", zoneTag(pond.code), "sanitario"],
            withdrawalDays,
            withdrawalUntil,
            eventAtIso,
            treatmentRecent
              ? `Tratamiento preventivo con retiro activo en ${pond.code}`
              : `Tratamiento historico completado en ${pond.code}`,
            userId
          ]
        );
        operationsCount += 1;
      }
    }

    const measurementsInsert = await query(
      `
        INSERT INTO measurements (tenant_id, sensor_id, pond_id, value, quality, recorded_at)
        SELECT
          s.tenant_id,
          s.id,
          s.pond_id,
          CASE s.type
            WHEN 'temperature'
              THEN ROUND((13.5 + (s.pond_id % 7) * 0.35 + (RANDOM() * 9.2))::numeric, 2)::double precision
            WHEN 'oxygen'
              THEN ROUND((4.4 + (RANDOM() * 5.8))::numeric, 2)::double precision
            WHEN 'salinity'
              THEN ROUND((27 + (RANDOM() * 13))::numeric, 2)::double precision
            WHEN 'ph'
              THEN ROUND((6.6 + (RANDOM() * 2.1))::numeric, 2)::double precision
            WHEN 'turbidity'
              THEN ROUND((1 + (RANDOM() * 44))::numeric, 2)::double precision
            ELSE ROUND((RANDOM() * 100)::numeric, 2)::double precision
          END AS value,
          CASE WHEN RANDOM() < 0.025 THEN 'suspect' ELSE 'ok' END AS quality,
          gs.recorded_at
        FROM sensors s
        CROSS JOIN LATERAL generate_series(
          NOW() - INTERVAL '45 days',
          NOW(),
          INTERVAL '6 hours'
        ) AS gs(recorded_at)
        WHERE s.tenant_id = $1
      `,
      [tenantId]
    );
  measurementsInserted = measurementsInsert.rowCount || 0;

    const openAlertSeeds = [
      { code: "A1", type: "oxygen", severity: "high", value: 5.11, hoursAgo: 2 },
      { code: "B1", type: "oxygen", severity: "high", value: 5.48, hoursAgo: 3 },
      { code: "C1", type: "temperature", severity: "medium", value: 25.9, hoursAgo: 5 },
      { code: "C4", type: "ph", severity: "medium", value: 8.39, hoursAgo: 6 },
      { code: "F3", type: "temperature", severity: "medium", value: 24.8, hoursAgo: 8 },
      { code: "E8", type: "oxygen", severity: "high", value: 5.42, hoursAgo: 10 },
      { code: "D6", type: "ph", severity: "medium", value: 6.82, hoursAgo: 11 },
      { code: "C7", type: "oxygen", severity: "high", value: 4.96, hoursAgo: 13 }
    ];

    for (const item of openAlertSeeds) {
      const sensorId = sensorByCodeType.get(`${item.code}:${item.type}`);
      const pond = pondByCode.get(item.code);

      if (!sensorId || !pond) {
        continue;
      }

      const message =
        item.type === "oxygen"
          ? "oxygen below minimum threshold"
          : item.type === "ph"
            ? "ph outside threshold range"
            : "temperature above maximum threshold";

      await query(
        `
          INSERT INTO alerts (
            tenant_id,
            pond_id,
            sensor_id,
            rule_id,
            severity,
            status,
            message,
            current_value,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8::timestamptz)
        `,
        [
          tenantId,
          pond.id,
          sensorId,
          ruleIdByType.get(item.type) || null,
          item.severity,
          message,
          item.value,
          new Date(Date.now() - item.hoursAgo * 3600 * 1000).toISOString()
        ]
      );

      alertsCount += 1;
    }

    const resolvedSensorTypes = ["oxygen", "temperature", "ph"];

    for (let index = 0; index < 20; index += 1) {
      const pond = pondByCode.get(pondSeeds[index % pondSeeds.length].code);
      const sensorType = resolvedSensorTypes[index % resolvedSensorTypes.length];
      const sensorId = sensorByCodeType.get(`${pond.code}:${sensorType}`);

      if (!sensorId) {
        continue;
      }

      const createdAt = new Date(Date.now() - randomInt(24, 240) * 3600 * 1000);
      const resolvedAt = new Date(createdAt.getTime() + randomInt(1, 12) * 3600 * 1000);

      await query(
        `
          INSERT INTO alerts (
            tenant_id,
            pond_id,
            sensor_id,
            rule_id,
            severity,
            status,
            message,
            current_value,
            created_at,
            resolved_at,
            resolved_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'resolved',
            $6,
            $7,
            $8::timestamptz,
            $9::timestamptz,
            $10
          )
        `,
        [
          tenantId,
          pond.id,
          sensorId,
          ruleIdByType.get(sensorType) || null,
          sensorType === "oxygen" ? "high" : "medium",
          `${sensorType} recovered to normal range`,
          sensorType === "oxygen" ? randomFloat(6.2, 8.6, 2) : randomFloat(7.1, 8.0, 2),
          createdAt.toISOString(),
          resolvedAt.toISOString(),
          userId
        ]
      );

      alertsCount += 1;
    }

    const cameraSessionSeeds = [
      {
        machineType: "Contadora S/L",
        machineId: "BFS-PGE-16S2C-CS-01",
        streamProtocol: "webrtc",
        expiresInMinutes: 65
      },
      {
        machineType: "Camara Biomasa",
        machineId: "BFS-PGE-16S2C-CS-02",
        streamProtocol: "hls",
        expiresInMinutes: 28
      },
      {
        machineType: "Camara Alimentacion",
        machineId: "BFS-PGE-16S2C-CS-03",
        streamProtocol: "webrtc",
        expiresInMinutes: -35
      },
      {
        machineType: "Camara Descarga",
        machineId: "BFS-PGE-16S2C-CS-04",
        streamProtocol: "hls",
        expiresInMinutes: -190
      }
    ];

    for (const session of cameraSessionSeeds) {
      const expiresAt = new Date(Date.now() + session.expiresInMinutes * 60 * 1000);
      const streamUrl =
        session.streamProtocol === "webrtc"
          ? `wss://jetson.local/mock-webrtc?tenant=${tenantId}&machine=${encodeURIComponent(session.machineId)}`
          : "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

      await query(
        `
          INSERT INTO camera_sessions (
            tenant_id,
            machine_type,
            machine_id,
            viewer_user_id,
            stream_protocol,
            stream_url,
            fallback_url,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
        `,
        [
          tenantId,
          session.machineType,
          session.machineId,
          userId,
          session.streamProtocol,
          streamUrl,
          "https://placehold.co/1280x720?text=FLIR+Blackfly+Mock+Stream",
          expiresAt.toISOString()
        ]
      );
    }

    const auditActions = [
      "seed.tenant.reset",
      "seed.ponds.inserted",
      "seed.sensors.inserted",
      "seed.operations.inserted",
      "seed.biomass.inserted",
      "seed.measurements.inserted",
      "seed.alerts.inserted",
      "seed.camera_sessions.inserted"
    ];

    for (let index = 0; index < auditActions.length; index += 1) {
      await query(
        `
          INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, payload, created_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
        `,
        [
          tenantId,
          userId,
          auditActions[index],
          "seed",
          `${index + 1}`,
          JSON.stringify({
            tenantCode,
            totalPonds: pondSeeds.length,
            generatedAt: new Date().toISOString()
          }),
          toIsoDaysAgo(randomInt(0, 2), 15)
        ]
      );
    }

    await query("COMMIT");

    logger.info(
      {
        tenantCode,
        adminEmail,
        adminPassword,
        ponds: pondSeeds.length,
        sensors: pondSeeds.length * sensorTemplates.length,
  measurements: measurementsInserted,
        biomassEntries: biomassCount,
        operations: operationsCount,
        alerts: alertsCount,
        oxygenSetpoints: oxygenSetpointsCount,
        oxygenColorSetpoints: oxygenColorSetpointsCount,
        temperatureColorSetpoints: temperatureColorSetpointsCount,
        phoneAlertSetpoints: phoneAlertSetpointsCount,
        smsAlertSetpoints: smsAlertSetpointsCount,
        cameraSessions: cameraSessionSeeds.length
      },
      "Seed completed with full demo dataset"
    );
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

seed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, "Seeding failed");
    await pool.end();
    process.exit(1);
  });
