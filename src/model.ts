import { rotate, type Pt } from './geometry'

export type Shape = 'rect' | 'ellipse'

export type Wall = { id: string; a: Pt; b: Pt; thickness: number }
export type Item = { id: string; kind: string; x: number; y: number; w: number; h: number; rot: number }
/** An opaque patch covering part of the background plan. Top-left anchored, mm. */
export type Erase = { id: string; x: number; y: number; w: number; h: number }
export type Note = { id: string; x: number; y: number; w: number; h: number; text: string; color: string; anchor?: Pt }
export type ImageRef = { dataUrl: string; wPx: number; hPx: number }

/** History-tracked document. The background image is deliberately NOT in here. */
export type Doc = {
  version: 1
  mmPerPx: number
  calibrated: boolean
  gridMm: number | null
  walls: Wall[]
  items: Item[]
  notes: Note[]
  erasures: Erase[]
}

export const emptyDoc = (): Doc => ({
  version: 1,
  mmPerPx: 1,
  calibrated: false,
  gridMm: 50,
  walls: [],
  items: [],
  notes: [],
  erasures: [],
})

export const DEFAULT_WALL_MM = 100

// ---------------------------------------------------------------------------
// Object catalog. Every placeable object is one row here — adding a type means
// adding a line, not a component. Sizes are real-world millimetres so a freshly
// dropped object is already roughly correct.
// ---------------------------------------------------------------------------

export type CatalogEntry = { kind: string; label: string; cat: string; shape: Shape; w: number; h: number }

export const CATALOG: CatalogEntry[] = [
  { kind: 'door',          label: 'Door',           cat: 'Structural', shape: 'rect',    w:  900, h:  100 },
  { kind: 'door-double',   label: 'Double door',    cat: 'Structural', shape: 'rect',    w: 1500, h:  100 },
  { kind: 'window',        label: 'Window',         cat: 'Structural', shape: 'rect',    w: 1200, h:  100 },
  { kind: 'opening',       label: 'Opening',        cat: 'Structural', shape: 'rect',    w:  900, h:  100 },
  { kind: 'stairs',        label: 'Stairs',         cat: 'Structural', shape: 'rect',    w: 1000, h: 3000 },
  { kind: 'stairs-landing',label: 'Landing',        cat: 'Structural', shape: 'rect',    w: 1000, h: 1000 },
  { kind: 'column',        label: 'Column',         cat: 'Structural', shape: 'rect',    w:  300, h:  300 },

  { kind: 'kitchen-block', label: 'Kitchen block',  cat: 'Kitchen',    shape: 'rect',    w: 3000, h:  600 },
  { kind: 'kitchen-island',label: 'Island',         cat: 'Kitchen',    shape: 'rect',    w: 1800, h:  900 },
  { kind: 'fridge',        label: 'Fridge',         cat: 'Kitchen',    shape: 'rect',    w:  600, h:  650 },
  { kind: 'oven',          label: 'Oven',           cat: 'Kitchen',    shape: 'rect',    w:  600, h:  600 },
  { kind: 'hob',           label: 'Hob',            cat: 'Kitchen',    shape: 'rect',    w:  600, h:  600 },
  { kind: 'dishwasher',    label: 'Dishwasher',     cat: 'Kitchen',    shape: 'rect',    w:  600, h:  600 },
  { kind: 'sink-kitchen',  label: 'Kitchen sink',   cat: 'Kitchen',    shape: 'rect',    w:  800, h:  600 },

  { kind: 'bath',          label: 'Bath',           cat: 'Bathroom',   shape: 'rect',    w: 1700, h:  700 },
  { kind: 'shower',        label: 'Shower',         cat: 'Bathroom',   shape: 'rect',    w:  900, h:  900 },
  { kind: 'toilet',        label: 'Toilet',         cat: 'Bathroom',   shape: 'ellipse', w:  400, h:  600 },
  { kind: 'sink',          label: 'Sink',           cat: 'Bathroom',   shape: 'ellipse', w:  550, h:  450 },
  { kind: 'washer',        label: 'Washing machine',cat: 'Bathroom',   shape: 'rect',    w:  600, h:  600 },

  { kind: 'couch-2',       label: 'Couch (2p)',     cat: 'Living',     shape: 'rect',    w: 1600, h:  900 },
  { kind: 'couch-3',       label: 'Couch (3p)',     cat: 'Living',     shape: 'rect',    w: 2100, h:  900 },
  { kind: 'couch-corner',  label: 'Corner couch',   cat: 'Living',     shape: 'rect',    w: 2600, h: 1800 },
  { kind: 'armchair',      label: 'Armchair',       cat: 'Living',     shape: 'rect',    w:  900, h:  900 },
  { kind: 'coffee-table',  label: 'Coffee table',   cat: 'Living',     shape: 'rect',    w: 1100, h:  600 },
  { kind: 'tv-unit',       label: 'TV unit',        cat: 'Living',     shape: 'rect',    w: 1600, h:  400 },

  { kind: 'table-4',       label: 'Table (4p)',     cat: 'Dining',     shape: 'rect',    w: 1200, h:  800 },
  { kind: 'table-6',       label: 'Table (6p)',     cat: 'Dining',     shape: 'rect',    w: 1800, h:  900 },
  { kind: 'table-round',   label: 'Round table',    cat: 'Dining',     shape: 'ellipse', w: 1200, h: 1200 },
  { kind: 'chair',         label: 'Chair',          cat: 'Dining',     shape: 'rect',    w:  450, h:  450 },

  { kind: 'bed-single',    label: 'Bed (single)',   cat: 'Bedroom',    shape: 'rect',    w:  900, h: 2000 },
  { kind: 'bed-double',    label: 'Bed (double)',   cat: 'Bedroom',    shape: 'rect',    w: 1400, h: 2000 },
  { kind: 'bed-queen',     label: 'Bed (queen)',    cat: 'Bedroom',    shape: 'rect',    w: 1600, h: 2000 },
  { kind: 'bed-king',      label: 'Bed (king)',     cat: 'Bedroom',    shape: 'rect',    w: 1800, h: 2000 },
  { kind: 'nightstand',    label: 'Nightstand',     cat: 'Bedroom',    shape: 'rect',    w:  450, h:  400 },
  { kind: 'wardrobe',      label: 'Wardrobe',       cat: 'Bedroom',    shape: 'rect',    w: 2000, h:  600 },
  { kind: 'cupboard',      label: 'Cupboard',       cat: 'Bedroom',    shape: 'rect',    w: 1000, h:  400 },
  { kind: 'desk',          label: 'Desk',           cat: 'Bedroom',    shape: 'rect',    w: 1400, h:  700 },
]

export const catalogOf = (kind: string): CatalogEntry =>
  CATALOG.find((c) => c.kind === kind) ?? { kind, label: kind, cat: 'Other', shape: 'rect', w: 500, h: 500 }

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.cat))]

export const NOTE_COLORS = ['#ffe066', '#ffa8a8', '#8ce99a', '#a5d8ff', '#d0bfff']

/** Sticky notes live in model space so they scale with the plan and print correctly. */
export const NOTE_W = 1200
export const NOTE_H = 800
export const NOTE_FONT = 80

// ---------------------------------------------------------------------------
// State + reducer
// ---------------------------------------------------------------------------

export type State = {
  past: Doc[]
  doc: Doc
  future: Doc[]
  image: ImageRef | null
  selection: string[]
}

export const initialState = (): State => ({ past: [], doc: emptyDoc(), future: [], image: null, selection: [] })

export type Action =
  /** Snapshot the document before a drag. Live updates during the drag skip history. */
  | { t: 'begin' }
  | { t: 'setImage'; image: ImageRef }
  | { t: 'calibrate'; mmPerPx: number }
  | { t: 'load'; doc: Doc; image: ImageRef | null }
  | { t: 'addWall'; wall: Wall }
  | { t: 'addItem'; item: Item }
  | { t: 'addNote'; note: Note }
  | { t: 'addErase'; erase: Erase }
  | { t: 'patchWall'; id: string; patch: Partial<Wall>; live?: boolean }
  | { t: 'patchItem'; id: string; patch: Partial<Item>; live?: boolean }
  | { t: 'patchNote'; id: string; patch: Partial<Note>; live?: boolean }
  | { t: 'patchErase'; id: string; patch: Partial<Erase>; live?: boolean }
  | { t: 'moveEndpoint'; from: Pt; to: Pt; live?: boolean }
  | { t: 'delete'; ids: string[] }
  | { t: 'select'; ids: string[] }
  | { t: 'setGrid'; gridMm: number | null }
  | { t: 'undo' }
  | { t: 'redo' }

const HISTORY_CAP = 50

const push = (s: State, doc: Doc): State => ({
  ...s,
  past: [...s.past, s.doc].slice(-HISTORY_CAP),
  doc,
  future: [],
})

const write = (s: State, doc: Doc, live?: boolean): State => (live ? { ...s, doc } : push(s, doc))

const patch = <T extends { id: string }>(list: T[], id: string, p: Partial<T>): T[] =>
  list.map((x) => (x.id === id ? { ...x, ...p } : x))

/** Endpoints within this many mm are treated as the same joint. */
const JOINT_EPS = 0.5

export const reducer = (s: State, a: Action): State => {
  switch (a.t) {
    case 'begin':
      return { ...s, past: [...s.past, s.doc].slice(-HISTORY_CAP), future: [] }

    case 'setImage':
      return { ...s, image: a.image }

    case 'calibrate': {
      // Geometry was placed in millimetres derived from the old scale. Rescale it
      // so it stays glued to the same pixels of the background image.
      const k = a.mmPerPx / s.doc.mmPerPx
      const sp = (p: Pt): Pt => ({ x: p.x * k, y: p.y * k })
      return push(s, {
        ...s.doc,
        mmPerPx: a.mmPerPx,
        calibrated: true,
        walls: s.doc.walls.map((w) => ({ ...w, a: sp(w.a), b: sp(w.b), thickness: w.thickness })),
        items: s.doc.items.map((i) => ({ ...i, x: i.x * k, y: i.y * k, w: i.w, h: i.h })),
        notes: s.doc.notes.map((n) => ({ ...n, x: n.x * k, y: n.y * k, anchor: n.anchor && sp(n.anchor) })),
        erasures: s.doc.erasures.map((e) => ({ ...e, x: e.x * k, y: e.y * k, w: e.w * k, h: e.h * k })),
      })
    }

    case 'load':
      return { past: [], doc: a.doc, future: [], image: a.image, selection: [] }

    case 'addWall':
      return push(s, { ...s.doc, walls: [...s.doc.walls, a.wall] })
    case 'addItem':
      return { ...push(s, { ...s.doc, items: [...s.doc.items, a.item] }), selection: [a.item.id] }
    case 'addNote':
      return { ...push(s, { ...s.doc, notes: [...s.doc.notes, a.note] }), selection: [a.note.id] }
    case 'addErase':
      return { ...push(s, { ...s.doc, erasures: [...s.doc.erasures, a.erase] }), selection: [a.erase.id] }

    case 'patchWall':
      return write(s, { ...s.doc, walls: patch(s.doc.walls, a.id, a.patch) }, a.live)
    case 'patchItem':
      return write(s, { ...s.doc, items: patch(s.doc.items, a.id, a.patch) }, a.live)
    case 'patchNote':
      return write(s, { ...s.doc, notes: patch(s.doc.notes, a.id, a.patch) }, a.live)
    case 'patchErase':
      return write(s, { ...s.doc, erasures: patch(s.doc.erasures, a.id, a.patch) }, a.live)

    case 'moveEndpoint': {
      // Walls meeting at a joint move together, so corners never come apart.
      const near = (p: Pt) => Math.hypot(p.x - a.from.x, p.y - a.from.y) <= JOINT_EPS
      return write(
        s,
        {
          ...s.doc,
          walls: s.doc.walls.map((w) => ({
            ...w,
            a: near(w.a) ? { ...a.to } : w.a,
            b: near(w.b) ? { ...a.to } : w.b,
          })),
        },
        a.live,
      )
    }

    case 'delete': {
      const gone = new Set(a.ids)
      return {
        ...push(s, {
          ...s.doc,
          walls: s.doc.walls.filter((w) => !gone.has(w.id)),
          items: s.doc.items.filter((i) => !gone.has(i.id)),
          notes: s.doc.notes.filter((n) => !gone.has(n.id)),
          erasures: s.doc.erasures.filter((e) => !gone.has(e.id)),
        }),
        selection: [],
      }
    }

    case 'select':
      return { ...s, selection: a.ids }

    case 'setGrid':
      return { ...s, doc: { ...s.doc, gridMm: a.gridMm } }

    case 'undo': {
      const prev = s.past.at(-1)
      if (!prev) return s
      return { ...s, past: s.past.slice(0, -1), doc: prev, future: [s.doc, ...s.future], selection: [] }
    }
    case 'redo': {
      const next = s.future[0]
      if (!next) return s
      return { ...s, past: [...s.past, s.doc], doc: next, future: s.future.slice(1), selection: [] }
    }
  }
}

export const uid = () => crypto.randomUUID()

/** Every wall endpoint, for snapping and joint rendering. */
export const endpointsOf = (doc: Doc): Pt[] => doc.walls.flatMap((w) => [w.a, w.b])

/** Endpoints shared by 2+ walls — these get a patch drawn over the butt caps. */
export const jointsOf = (doc: Doc): Pt[] => {
  const seen = new Map<string, { p: Pt; n: number }>()
  for (const p of endpointsOf(doc)) {
    const k = `${Math.round(p.x / JOINT_EPS)}:${Math.round(p.y / JOINT_EPS)}`
    const hit = seen.get(k)
    if (hit) hit.n++
    else seen.set(k, { p, n: 1 })
  }
  return [...seen.values()].filter((v) => v.n > 1).map((v) => v.p)
}

export type Bounds = { x: number; y: number; w: number; h: number }

export const PAD_MM = 300

/** Millimetre bounding box of everything that should appear in an export. */
export const contentBounds = (doc: Doc, image: ImageRef | null): Bounds => {
  const pts: Pt[] = []
  if (image) {
    pts.push({ x: 0, y: 0 }, { x: image.wPx * doc.mmPerPx, y: image.hPx * doc.mmPerPx })
  }
  for (const w of doc.walls) {
    const t = w.thickness / 2
    for (const p of [w.a, w.b]) pts.push({ x: p.x - t, y: p.y - t }, { x: p.x + t, y: p.y + t })
  }
  for (const i of doc.items) {
    const c = { x: i.x, y: i.y }
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      pts.push(rotate({ x: i.x + (sx * i.w) / 2, y: i.y + (sy * i.h) / 2 }, c, i.rot))
    }
  }
  for (const n of doc.notes) {
    pts.push({ x: n.x - n.w / 2, y: n.y - n.h / 2 }, { x: n.x + n.w / 2, y: n.y + n.h / 2 })
    if (n.anchor) pts.push(n.anchor)
  }
  if (!pts.length) return { x: 0, y: 0, w: 1000, h: 1000 }

  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs) - PAD_MM
  const y = Math.min(...ys) - PAD_MM
  return { x, y, w: Math.max(...xs) - x + PAD_MM, h: Math.max(...ys) - y + PAD_MM }
}
