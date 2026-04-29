/**
 * Modelo DSJ — Cascada de producción citrícola Lasarte SAT.
 *
 * Producción real = Calibrador + Industria manual − Mujeres(L) − Reciclado Z1 − Reciclado Z2
 * Palets ajustados = Palets brutos − Inventario día anterior sin alta
 * Diferencia bruta = Producción real − Palets ajustados − Inventario final sin alta
 * Mermas totales = Podrido calibrador + Podrido manual (bolsa basura)
 * DSJ = Diferencia bruta − Mermas totales   (diferencia justificada por podrido y merma natural)
 * % DSJ = DSJ / Producción real
 */

export interface CascadeInput {
  // Automáticos (desde archivos / production_runs / gstock)
  kg_produccion_calibrador: number;
  kg_mujeres_calibrador: number;
  kg_palets_brutos: number;
  kg_podrido_calibrador: number;
  // Manuales (5 campos del operario)
  kg_industria_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_inventario_sin_alta: number;          // inventario final del día sin dar de alta
  kg_podrido_bolsa_basura: number;         // podrido manual (bolsa basura)
  // Arrastre
  kg_inventario_anterior_sin_alta: number;
}

export interface CascadeResult {
  produccion_calibrador: number;
  industria_manual: number;
  mujeres: number;
  reciclado_z1: number;
  reciclado_z2: number;
  produccion_real: number;

  palets_brutos: number;
  inventario_anterior: number;
  palets_ajustados: number;

  inventario_final: number;
  diferencia_bruta: number;

  podrido_calibrador: number;
  podrido_manual: number;
  mermas_totales: number;

  dsj: number;
  dsj_pct: number;
  semaforo: "verde" | "amarillo" | "rojo";
}

export function computeCascade(input: CascadeInput): CascadeResult {
  const n = (v: number) => Number(v) || 0;

  const produccion_calibrador = n(input.kg_produccion_calibrador);
  const industria_manual = n(input.kg_industria_manual);
  const mujeres = n(input.kg_mujeres_calibrador);
  const reciclado_z1 = n(input.kg_reciclado_malla_z1);
  const reciclado_z2 = n(input.kg_reciclado_malla_z2);

  const produccion_real =
    produccion_calibrador + industria_manual - mujeres - reciclado_z1 - reciclado_z2;

  const palets_brutos = n(input.kg_palets_brutos);
  const inventario_anterior = n(input.kg_inventario_anterior_sin_alta);
  const palets_ajustados = palets_brutos - inventario_anterior;

  const inventario_final = n(input.kg_inventario_sin_alta);
  const diferencia_bruta = produccion_real - palets_ajustados - inventario_final;

  const podrido_calibrador = n(input.kg_podrido_calibrador);
  const podrido_manual = n(input.kg_podrido_bolsa_basura);
  const mermas_totales = podrido_calibrador + podrido_manual;

  const dsj = diferencia_bruta - mermas_totales;
  const dsj_pct = produccion_real > 0 ? (dsj / produccion_real) * 100 : 0;

  const abs = Math.abs(dsj_pct);
  const semaforo: "verde" | "amarillo" | "rojo" =
    abs < 1 ? "verde" : abs <= 3 ? "amarillo" : "rojo";

  return {
    produccion_calibrador,
    industria_manual,
    mujeres,
    reciclado_z1,
    reciclado_z2,
    produccion_real,
    palets_brutos,
    inventario_anterior,
    palets_ajustados,
    inventario_final,
    diferencia_bruta,
    podrido_calibrador,
    podrido_manual,
    mermas_totales,
    dsj,
    dsj_pct,
    semaforo,
  };
}
