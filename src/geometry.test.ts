import { describe, expect, it } from 'vitest'
import {
  calibrate,
  dist,
  mmToScreen,
  parseLength,
  pointAtLength,
  screenToMm,
  snap,
  snapAngle,
  toMm,
  zoomAt,
  type View,
} from './geometry'
import { emptyDoc, initialState, reducer, uid, type Doc, type State } from './model'

const rect = (width = 800, height = 600): DOMRect =>
  ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect

describe('calibration', () => {
  it('derives mm per pixel from a measured line', () => {
    // 200 image px spanned a wall the user says is 3.60 m
    expect(calibrate(200, 3.6, 'm')).toBeCloseTo(18, 10)
    expect(calibrate(200, 360, 'cm')).toBeCloseTo(18, 10)
    expect(calibrate(200, 3600, 'mm')).toBeCloseTo(18, 10)
  })

  it('rejects degenerate input rather than producing a silently wrong scale', () => {
    expect(() => calibrate(0, 3.6, 'm')).toThrow()
    expect(() => calibrate(200, 0, 'm')).toThrow()
  })

  it('rescales existing geometry so it stays glued to the image', () => {
    let s = initialState()
    s = reducer(s, { t: 'calibrate', mmPerPx: 10 })
    s = reducer(s, {
      t: 'addWall',
      wall: { id: uid(), a: { x: 0, y: 0 }, b: { x: 3600, y: 0 }, thickness: 100 },
    })
    // User realises the scale was wrong: the same line is really 20 mm/px.
    s = reducer(s, { t: 'calibrate', mmPerPx: 20 })
    expect(s.doc.walls[0].b.x).toBe(7200)
    expect(s.doc.mmPerPx).toBe(20)
  })
})

describe('unit conversion', () => {
  it('converts to millimetres', () => {
    expect(toMm(3.6, 'm')).toBe(3600)
    expect(toMm(85, 'cm')).toBe(850)
    expect(toMm(900, 'mm')).toBe(900)
  })
})

describe('screen <-> mm', () => {
  const r = rect()
  for (const scale of [0.05, 1, 7.3, 200]) {
    it(`round-trips at scale ${scale}`, () => {
      const v: View = { cx: 1234, cy: -567, scale }
      for (const p of [
        { x: 0, y: 0 },
        { x: 800, y: 600 },
        { x: 137, y: 401 },
      ]) {
        const mm = screenToMm(p.x, p.y, v, r)
        const back = mmToScreen(mm, v, r)
        expect(back.x).toBeCloseTo(p.x, 6)
        expect(back.y).toBeCloseTo(p.y, 6)
      }
    })
  }

  it('puts the view centre at the centre of the element', () => {
    const v: View = { cx: 500, cy: 500, scale: 2 }
    const mm = screenToMm(400, 300, v, rect())
    expect(mm).toEqual({ x: 500, y: 500 })
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const r = rect()
    let v: View = { cx: 0, cy: 0, scale: 4 }
    const before = screenToMm(650, 120, v, r)
    v = zoomAt(v, r, 650, 120, 0.8)
    const after = screenToMm(650, 120, v, r)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })
})

describe('snapping', () => {
  const endpoints = [
    { x: 1000, y: 1000 },
    { x: 5000, y: 0 },
  ]

  it('prefers an endpoint over the grid', () => {
    // 20 mm away with a 12 px radius at 4 mm/px => 48 mm reach
    const r = snap({ x: 1020, y: 1000 }, { scale: 4, gridMm: 50, endpoints })
    expect(r.kind).toBe('endpoint')
    expect(r.pt).toEqual({ x: 1000, y: 1000 })
  })

  it('falls back to the grid when no endpoint is in reach', () => {
    const r = snap({ x: 2237, y: 981 }, { scale: 1, gridMm: 50, endpoints })
    expect(r.kind).toBe('grid')
    expect(r.pt).toEqual({ x: 2250, y: 1000 })
  })

  it('shrinks its reach in millimetres as you zoom in', () => {
    // Same 20 mm gap, but at 0.5 mm/px the 12 px radius is only 6 mm.
    const r = snap({ x: 1020, y: 1000 }, { scale: 0.5, gridMm: null, endpoints })
    expect(r.kind).toBe(null)
  })

  it('is fully bypassed when disabled (Alt held)', () => {
    const p = { x: 1001, y: 1001 }
    const r = snap(p, { scale: 4, gridMm: 50, endpoints, disabled: true })
    expect(r.kind).toBe(null)
    expect(r.pt).toEqual(p)
  })

  it('constrains direction to ortho and 45 degrees without changing length', () => {
    const origin = { x: 0, y: 0 }
    const p = { x: 1000, y: 80 }
    const s = snapAngle(origin, p, 45)
    expect(s.y).toBeCloseTo(0, 6)
    expect(dist(origin, s)).toBeCloseTo(dist(origin, p), 6)
  })
})

describe('typed length entry', () => {
  it('commits exactly the requested length along the current direction', () => {
    const origin = { x: 250, y: 250 }
    // Pointer is somewhere vaguely down-right; user types 3600.
    const p = pointAtLength(origin, { x: 1234, y: 1234 }, 3600)
    expect(dist(origin, p)).toBeCloseTo(3600, 9)
  })

  it('does not move the point when the direction is undefined', () => {
    const origin = { x: 10, y: 10 }
    expect(pointAtLength(origin, origin, 3600)).toEqual(origin)
  })
})

describe('walls', () => {
  it('moves every wall meeting at a joint together', () => {
    let s = initialState()
    const corner = { x: 1000, y: 0 }
    s = reducer(s, { t: 'addWall', wall: { id: 'w1', a: { x: 0, y: 0 }, b: corner, thickness: 100 } })
    s = reducer(s, { t: 'addWall', wall: { id: 'w2', a: corner, b: { x: 1000, y: 900 }, thickness: 100 } })
    s = reducer(s, { t: 'moveEndpoint', from: corner, to: { x: 1500, y: -200 } })
    expect(s.doc.walls[0].b).toEqual({ x: 1500, y: -200 })
    expect(s.doc.walls[1].a).toEqual({ x: 1500, y: -200 })
    expect(s.doc.walls[0].a).toEqual({ x: 0, y: 0 })
  })
})

describe('undo / redo', () => {
  const withWalls = (n: number): State => {
    let s = initialState()
    for (let i = 0; i < n; i++) {
      s = reducer(s, { t: 'addWall', wall: { id: `w${i}`, a: { x: i, y: 0 }, b: { x: i, y: 1 }, thickness: 100 } })
    }
    return s
  }

  it('steps backwards and forwards in order', () => {
    let s = withWalls(3)
    expect(s.doc.walls).toHaveLength(3)
    s = reducer(s, { t: 'undo' })
    expect(s.doc.walls.map((w) => w.id)).toEqual(['w0', 'w1'])
    s = reducer(s, { t: 'undo' })
    expect(s.doc.walls.map((w) => w.id)).toEqual(['w0'])
    s = reducer(s, { t: 'redo' })
    expect(s.doc.walls.map((w) => w.id)).toEqual(['w0', 'w1'])
  })

  it('drops the redo stack once you make a new edit', () => {
    let s = reducer(withWalls(2), { t: 'undo' })
    expect(s.future).toHaveLength(1)
    s = reducer(s, { t: 'addWall', wall: { id: 'x', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, thickness: 100 } })
    expect(s.future).toHaveLength(0)
  })

  it('is a no-op at either end of the stack', () => {
    const s = initialState()
    expect(reducer(s, { t: 'undo' })).toBe(s)
    expect(reducer(s, { t: 'redo' })).toBe(s)
  })

  it('caps history at 50 entries', () => {
    const s = withWalls(80)
    expect(s.past).toHaveLength(50)
    // The oldest reachable state still has walls; we lost only the deep past.
    expect(s.past[0].walls).toHaveLength(30)
  })

  it('does not record live drag updates', () => {
    let s = reducer(initialState(), {
      t: 'addWall',
      wall: { id: 'w', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 100 },
    })
    const depth = s.past.length
    s = reducer(s, { t: 'begin' })
    for (let x = 100; x < 400; x += 10) {
      s = reducer(s, { t: 'patchWall', id: 'w', patch: { b: { x, y: 0 } }, live: true })
    }
    expect(s.past).toHaveLength(depth + 1)
    s = reducer(s, { t: 'undo' })
    expect(s.doc.walls[0].b.x).toBe(100)
  })

  it('leaves the background image out of history', () => {
    let s = reducer(initialState(), { t: 'setImage', image: { dataUrl: 'data:,x', wPx: 10, hPx: 10 } })
    s = reducer(s, { t: 'addWall', wall: { id: 'w', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, thickness: 100 } })
    s = reducer(s, { t: 'undo' })
    expect(s.image).not.toBeNull()
    const doc: Doc = emptyDoc()
    expect(Object.keys(doc)).not.toContain('image')
  })
})

describe('parseLength', () => {
  it('reads the units people actually type', () => {
    expect(parseLength('3600')).toBe(3600)
    expect(parseLength('3600 mm')).toBe(3600)
    expect(parseLength('360cm')).toBe(3600)
    expect(parseLength('3.6 m')).toBe(3600)
    expect(parseLength('3,6m')).toBe(3600)
    expect(parseLength(' 3.6M ')).toBe(3600)
  })

  it('refuses to guess', () => {
    for (const bad of ['', 'abc', '3.6 metres', '-5', '0', '3 6', '3.6m2']) {
      expect(parseLength(bad)).toBeNull()
    }
  })
})
