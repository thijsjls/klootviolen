// All model coordinates are millimetres. 1 SVG user unit == 1 mm.
// This file owns the only two conversions in the app:
//   screen px <-> mm  (pointer input, snap radii)
//   image px  -> mm   (calibration)

export type Pt = { x: number; y: number }

/**
 * The viewport. `scale` is millimetres per screen pixel, so it doubles as the
 * conversion factor for anything specified in screen units (snap radii, handle
 * sizes). The viewBox is derived from the live element size every render, which
 * keeps its aspect ratio equal to the element's and makes the px<->mm mapping a
 * plain linear function with no letterboxing to account for.
 */
export type View = { cx: number; cy: number; scale: number }

export type Size = { width: number; height: number }

export const viewBox = (v: View, el: Size): string => {
  const w = el.width * v.scale
  const h = el.height * v.scale
  return `${v.cx - w / 2} ${v.cy - h / 2} ${w} ${h}`
}

/** Client (screen) coordinates -> millimetres. `el` is the SVG bounding rect. */
export const screenToMm = (clientX: number, clientY: number, v: View, el: DOMRect): Pt => ({
  x: v.cx + (clientX - el.left - el.width / 2) * v.scale,
  y: v.cy + (clientY - el.top - el.height / 2) * v.scale,
})

/** Millimetres -> client (screen) coordinates. Inverse of screenToMm. */
export const mmToScreen = (p: Pt, v: View, el: DOMRect): Pt => ({
  x: el.left + el.width / 2 + (p.x - v.cx) / v.scale,
  y: el.top + el.height / 2 + (p.y - v.cy) / v.scale,
})

/** Zoom by `factor` while keeping the millimetre point under the cursor fixed. */
export const zoomAt = (v: View, el: DOMRect, clientX: number, clientY: number, factor: number): View => {
  const anchor = screenToMm(clientX, clientY, v, el)
  const scale = clamp(v.scale * factor, 0.05, 200)
  // Solve for the centre that leaves `anchor` under the same screen point.
  const k = scale / v.scale
  return {
    scale,
    cx: anchor.x + (v.cx - anchor.x) * k,
    cy: anchor.y + (v.cy - anchor.y) * k,
  }
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

export const angleOf = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x)

/** Point at exactly `length` mm from `origin` in the direction of `towards`. */
export const pointAtLength = (origin: Pt, towards: Pt, length: number): Pt => {
  const d = dist(origin, towards)
  if (d === 0) return { ...origin }
  return { x: origin.x + ((towards.x - origin.x) / d) * length, y: origin.y + ((towards.y - origin.y) / d) * length }
}

/** Constrain `p` so the direction from `origin` is a multiple of `stepDeg`. Length is preserved. */
export const snapAngle = (origin: Pt, p: Pt, stepDeg: number): Pt => {
  const step = (stepDeg * Math.PI) / 180
  const a = Math.round(angleOf(origin, p) / step) * step
  const d = dist(origin, p)
  return { x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d }
}

export type SnapOpts = {
  scale: number // mm per screen px
  gridMm: number | null
  endpoints: Pt[]
  /** Alt held: bypass everything and return the raw point. */
  disabled?: boolean
  /** Snap radius in *screen* pixels, so it feels the same at every zoom level. */
  radiusPx?: number
}

export type SnapResult = { pt: Pt; kind: 'endpoint' | 'grid' | null }

/**
 * Endpoint snapping wins over grid snapping: joining two walls exactly matters
 * more than sitting on a round number.
 */
export const snap = (p: Pt, o: SnapOpts): SnapResult => {
  if (o.disabled) return { pt: p, kind: null }

  const radiusMm = (o.radiusPx ?? 12) * o.scale
  let best: Pt | null = null
  let bestD = radiusMm
  for (const e of o.endpoints) {
    const d = dist(p, e)
    if (d <= bestD) {
      bestD = d
      best = e
    }
  }
  if (best) return { pt: { ...best }, kind: 'endpoint' }

  if (o.gridMm && o.gridMm > 0) {
    return {
      pt: { x: Math.round(p.x / o.gridMm) * o.gridMm, y: Math.round(p.y / o.gridMm) * o.gridMm },
      kind: 'grid',
    }
  }
  return { pt: p, kind: null }
}

/** Rotate `p` around `origin` by `deg`. */
export const rotate = (p: Pt, origin: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

export type Unit = 'mm' | 'cm' | 'm'
const UNIT_MM: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 }

export const toMm = (value: number, unit: Unit) => value * UNIT_MM[unit]
export const fromMm = (mm: number, unit: Unit) => mm / UNIT_MM[unit]

/**
 * Calibration: the user drew a line across `pixelLength` image pixels and told
 * us it is `realLength` `unit` long. The typed length is the source of truth.
 */
export const calibrate = (pixelLength: number, realLength: number, unit: Unit): number => {
  if (pixelLength <= 0) throw new Error('calibration line has no length')
  if (realLength <= 0) throw new Error('real length must be positive')
  return toMm(realLength, unit) / pixelLength
}

/** Human-readable millimetres: 3600 -> "3.60 m", 850 -> "850 mm". */
export const formatMm = (mm: number): string =>
  Math.abs(mm) >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`

/**
 * Parse a length the user typed, e.g. "3.6 m", "360cm", "3600". Bare numbers are
 * millimetres. Returns null on anything it does not fully understand rather than
 * guessing — a misread calibration silently corrupts every measurement after it.
 */
export const parseLength = (input: string): number | null => {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m)?\s*$/i.exec(input.replace(',', '.'))
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n) || n <= 0) return null
  return toMm(n, (m[2]?.toLowerCase() as Unit) ?? 'mm')
}

/** A view that fits `b` into an element of `el` pixels, with a little margin. */
export const fitView = (b: { x: number; y: number; w: number; h: number }, el: Size): View => ({
  cx: b.x + b.w / 2,
  cy: b.y + b.h / 2,
  scale: clamp(Math.max(b.w / el.width, b.h / el.height) * 1.1, 0.05, 200),
})
