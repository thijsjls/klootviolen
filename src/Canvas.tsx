import { useEffect, useRef, useState } from 'react'
import {
  angleOf,
  dist,
  formatMm,
  pointAtAngle,
  pointAtLength,
  rotate,
  screenToMm,
  snap,
  snapAngle,
  viewBox,
  zoomAt,
  type Pt,
  type View,
} from './geometry'
import {
  catalogOf,
  DEFAULT_WALL_MM,
  endpointsOf,
  jointsOf,
  NOTE_FONT,
  NOTE_H,
  NOTE_W,
  NOTE_COLORS,
  uid,
  type Erase,
  type Action,
  type Item,
  type Note,
  type State,
} from './model'

export type Tool =
  | { t: 'select' }
  | { t: 'wall' }
  | { t: 'note' }
  | { t: 'erase' }
  | { t: 'calibrate' }
  | { t: 'place'; kind: string }

type Drag =
  | { k: 'pan'; client: Pt; view: View }
  | { k: 'move-item'; id: string; grab: Pt }
  | { k: 'resize'; id: string; sx: number; sy: number; fixed: Pt; rot: number }
  | { k: 'rotate'; id: string; center: Pt }
  | { k: 'endpoint'; at: Pt }
  | { k: 'move-note'; id: string; grab: Pt }
  | { k: 'note-anchor'; id: string }
  | { k: 'erase'; a: Pt }
  | { k: 'move-erase'; id: string; grab: Pt }
  | { k: 'calibrate' }

const MIN_ITEM_MM = 50

/** Two dragged corners -> a positive-size rect. */
const rectOf = (d: { a: Pt; b: Pt }): Omit<Erase, 'id'> => ({
  x: Math.min(d.a.x, d.b.x),
  y: Math.min(d.a.y, d.b.y),
  w: Math.abs(d.b.x - d.a.x),
  h: Math.abs(d.b.y - d.a.y),
})

type Props = {
  state: State
  dispatch: (a: Action) => void
  view: View
  setView: (v: View) => void
  tool: Tool
  setTool: (t: Tool) => void
  svgRef: React.RefObject<SVGSVGElement>
  onCalibrated: (measuredMm: number) => void
}

export default function Canvas({ state, dispatch, view, setView, tool, setTool, svgRef, onCalibrated }: Props) {
  const { doc, image, selection } = state
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [pending, setPending] = useState<Pt | null>(null)
  const [cal, setCal] = useState<{ a: Pt; b: Pt } | null>(null)
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [lengthInput, setLengthInput] = useState('')
  const [angleInput, setAngleInput] = useState('')
  const drag = useRef<Drag | null>(null)
  const alt = useRef(false)

  // Track the element size so the viewBox aspect always matches the element's.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      if (r.width && r.height) setSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [svgRef])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      alt.current = e.altKey
      if (e.key === 'Escape') {
        setPending(null)
        setCal(null)
        setBox(null)
        setEditing(null)
      }
    }
    const up = (e: KeyboardEvent) => (alt.current = e.altKey)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const rect = () => svgRef.current!.getBoundingClientRect()
  const at = (e: { clientX: number; clientY: number }): Pt => screenToMm(e.clientX, e.clientY, view, rect())

  /** Snapped model point for the current pointer, honouring Alt-to-disable. */
  const snapped = (e: { clientX: number; clientY: number; altKey?: boolean }, origin?: Pt | null): Pt => {
    const raw = at(e)
    const disabled = e.altKey ?? alt.current
    const s = snap(raw, { scale: view.scale, gridMm: doc.gridMm, endpoints: endpointsOf(doc), disabled })
    // Angle constraint only applies while drawing from an anchor, and an exact
    // endpoint snap outranks it — joining walls matters more than a round angle.
    if (origin && s.kind !== 'endpoint' && !disabled) {
      const a = snapAngle(origin, raw, 45)
      // Round the *length* to the grid rather than the point, so the segment keeps
      // both its constrained angle and a round length.
      if (doc.gridMm) return pointAtLength(origin, a, Math.round(dist(origin, a) / doc.gridMm) * doc.gridMm)
      return a
    }
    return s.pt
  }

  // ---- pointer plumbing ---------------------------------------------------

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey && tool.t === 'select')) {
      drag.current = { k: 'pan', client: { x: e.clientX, y: e.clientY }, view }
      svgRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const p = snapped(e, pending)

    switch (tool.t) {
      case 'calibrate': {
        // Raw, unsnapped: the calibration line defines the scale, so it must
        // follow the pointer exactly at both ends. Snapping it would bake a
        // grid-rounding error into every measurement in the document.
        const raw = at(e)
        setCal({ a: raw, b: raw })
        drag.current = { k: 'calibrate' }
        svgRef.current!.setPointerCapture(e.pointerId)
        return
      }

      case 'wall':
        if (!pending) setPending(p)
        else {
          if (dist(pending, p) > 1) dispatch({ t: 'addWall', wall: { id: uid(), a: pending, b: p, thickness: DEFAULT_WALL_MM } })
          setPending(p)
          setLengthInput('')
          setAngleInput('')
        }
        return

      case 'erase': {
        // Raw, unsnapped: an erase patch is a purely visual cover-up, so it should
        // sit exactly where you drew it rather than being yanked to a wall corner.
        const raw = at(e)
        setBox({ a: raw, b: raw })
        drag.current = { k: 'erase', a: raw }
        svgRef.current!.setPointerCapture(e.pointerId)
        return
      }

      case 'note':
        dispatch({
          t: 'addNote',
          note: { id: uid(), x: p.x, y: p.y, w: NOTE_W, h: NOTE_H, text: '', color: NOTE_COLORS[0] },
        })
        setTool({ t: 'select' })
        return

      case 'place': {
        const c = catalogOf(tool.kind)
        dispatch({ t: 'addItem', item: { id: uid(), kind: c.kind, x: p.x, y: p.y, w: c.w, h: c.h, rot: 0 } })
        setTool({ t: 'select' })
        return
      }

      case 'select':
        // Empty background: clear the selection and pan.
        dispatch({ t: 'select', ids: [] })
        drag.current = { k: 'pan', client: { x: e.clientX, y: e.clientY }, view }
        svgRef.current!.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    alt.current = e.altKey
    const d = drag.current
    if (!d) {
      if (tool.t === 'wall' || tool.t === 'calibrate') setCursor(snapped(e, pending))
      return
    }

    if (d.k === 'pan') {
      setView({
        ...d.view,
        cx: d.view.cx - (e.clientX - d.client.x) * d.view.scale,
        cy: d.view.cy - (e.clientY - d.client.y) * d.view.scale,
      })
      return
    }

    const p = snapped(e)

    switch (d.k) {
      case 'calibrate':
        // No snapping: calibration must follow the pointer exactly.
        setCal((c) => (c ? { ...c, b: at(e) } : c))
        return

      case 'erase':
        setBox((c) => (c ? { ...c, b: at(e) } : c))
        return

      case 'move-erase':
        dispatch({ t: 'patchErase', id: d.id, patch: { x: p.x - d.grab.x, y: p.y - d.grab.y }, live: true })
        return

      case 'endpoint':
        dispatch({ t: 'moveEndpoint', from: d.at, to: p, live: true })
        d.at = p
        return

      case 'move-item':
        dispatch({ t: 'patchItem', id: d.id, patch: { x: p.x - d.grab.x, y: p.y - d.grab.y }, live: true })
        return

      case 'move-note':
        dispatch({ t: 'patchNote', id: d.id, patch: { x: p.x - d.grab.x, y: p.y - d.grab.y }, live: true })
        return

      case 'note-anchor':
        dispatch({ t: 'patchNote', id: d.id, patch: { anchor: p }, live: true })
        return

      case 'rotate': {
        const deg = (angleOf(d.center, at(e)) * 180) / Math.PI + 90
        const r = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg)
        dispatch({ t: 'patchItem', id: d.id, patch: { rot: r }, live: true })
        return
      }

      case 'resize': {
        // Work in the item's own axis frame with the opposite corner pinned, so
        // the handles track the object rather than the screen.
        const q = rotate(p, d.fixed, -d.rot)
        let w = Math.max(MIN_ITEM_MM, Math.abs(q.x - d.fixed.x))
        let h = Math.max(MIN_ITEM_MM, Math.abs(q.y - d.fixed.y))
        const it = doc.items.find((i) => i.id === d.id)
        if (e.shiftKey && it) {
          const k = Math.max(w / it.w, h / it.h)
          w = it.w * k
          h = it.h * k
        }
        const centre = rotate({ x: d.fixed.x + (d.sx * w) / 2, y: d.fixed.y + (d.sy * h) / 2 }, d.fixed, d.rot)
        dispatch({ t: 'patchItem', id: d.id, patch: { x: centre.x, y: centre.y, w, h }, live: true })
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (d?.k === 'erase' && box) {
      const r = rectOf(box)
      // Ignore a stray click: an erase patch you can't see is one you can't delete.
      if (r.w > 2 * view.scale && r.h > 2 * view.scale) dispatch({ t: 'addErase', erase: { id: uid(), ...r } })
      setBox(null)
      return
    }
    if (d?.k === 'calibrate' && cal) {
      const measured = dist(cal.a, cal.b)
      if (measured > 0) onCalibrated(measured)
      setCal(null)
      setTool({ t: 'select' })
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    setView(zoomAt(view, rect(), e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)))
  }

  const beginDrag = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation()
    if (e.button !== 0) return
    dispatch({ t: 'begin' })
    drag.current = d
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  // ---- rendering ----------------------------------------------------------

  const s = view.scale // mm per screen px — multiply by this for constant on-screen size
  const sel = new Set(selection)
  const one = selection.length === 1 ? selection[0] : null
  const selItem = doc.items.find((i) => i.id === one)
  const editNote = doc.notes.find((n) => n.id === editing)

  /**
   * Commit the pending segment from what you typed. Either field may be left
   * blank, in which case the pointer supplies that half — so you can nail the
   * angle and eyeball the length, or the other way round.
   */
  const commitSegment = () => {
    if (!pending || !cursor) return
    const typedLen = parseFloat(lengthInput)
    const typedDeg = parseFloat(angleInput)
    const len = isFinite(typedLen) && typedLen > 0 ? typedLen : dist(pending, cursor)
    const deg = isFinite(typedDeg) ? typedDeg : (angleOf(pending, cursor) * 180) / Math.PI
    if (len <= 0) return
    const b = pointAtAngle(pending, len, deg)
    dispatch({ t: 'addWall', wall: { id: uid(), a: pending, b, thickness: DEFAULT_WALL_MM } })
    setPending(b)
    setLengthInput('')
    setAngleInput('')
  }

  const onEntryKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitSegment()
    if (e.key === 'Escape') setPending(null)
  }

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={viewBox(view, size)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{ cursor: tool.t === 'select' ? 'default' : 'crosshair' }}
      >
        <rect x={-1e7} y={-1e7} width={2e7} height={2e7} fill="#fbfbfa" />

        {/* Background plan. Locked: it must never intercept a click. */}
        {image && (
          <image
            href={image.dataUrl}
            x={0}
            y={0}
            width={image.wPx * doc.mmPerPx}
            height={image.hPx * doc.mmPerPx}
            style={{ pointerEvents: 'none' }}
            opacity={0.85}
          />
        )}

        {/* Nothing but the select tool may hit the scene — otherwise a wall,
            object or note swallows the click you meant for the canvas. */}
        <g style={{ pointerEvents: tool.t === 'select' ? undefined : 'none' }}>

          {/* Erased patches of the background plan. Above the image, below the drawing. */}
          {doc.erasures.map((r) => (
            <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="#fff"
              stroke={sel.has(r.id) ? '#e8590c' : 'none'} strokeWidth={1.5 * s} strokeDasharray={`${5 * s} ${4 * s}`}
              style={{ cursor: 'move' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                dispatch({ t: 'select', ids: [r.id] })
                beginDrag(e, { k: 'move-erase', id: r.id, grab: { x: at(e).x - r.x, y: at(e).y - r.y } })
              }}
            />
          ))}

          {/* Walls */}
          <g>
            {doc.walls.map((w) => (
              <g key={w.id}>
                <line
                  x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
                  stroke={sel.has(w.id) ? '#e8590c' : '#2f3437'}
                  strokeWidth={w.thickness}
                  strokeLinecap="butt"
                />
                {/* Fat invisible stroke: makes thin walls clickable at any zoom. */}
                <line
                  x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
                  stroke="transparent"
                  strokeWidth={Math.max(w.thickness, 12 * s)}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    dispatch({ t: 'select', ids: [w.id] })
                  }}
                />
              </g>
            ))}
            {/* Butt caps leave a notch at corners; patch each shared joint. */}
            {jointsOf(doc).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={DEFAULT_WALL_MM / 2} fill="#2f3437" style={{ pointerEvents: 'none' }} />
            ))}
        </g>

        {/* Objects */}
        {doc.items.map((i) => (
          <ItemView key={i.id} item={i} scale={s} selected={sel.has(i.id)}
            onDown={(e) => {
              e.stopPropagation()
              dispatch({ t: 'select', ids: [i.id] })
              beginDrag(e, { k: 'move-item', id: i.id, grab: { x: at(e).x - i.x, y: at(e).y - i.y } })
            }}
          />
        ))}

        {/* Sticky notes */}
        {doc.notes.map((n) => (
          <NoteView key={n.id} note={n} scale={s} selected={sel.has(n.id)}
            onDown={(e) => {
              e.stopPropagation()
              dispatch({ t: 'select', ids: [n.id] })
              beginDrag(e, { k: 'move-note', id: n.id, grab: { x: at(e).x - n.x, y: at(e).y - n.y } })
            }}
            onEdit={() => setEditing(n.id)}
          />
        ))}
        </g>

        {/* ---- overlay: handles, previews. Excluded from export. ---- */}
        <g id="overlay">
          {/* Wall endpoint handles */}
          {tool.t === 'select' && doc.walls.some((w) => sel.has(w.id)) &&
            endpointsOf(doc).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={5 * s} fill="#fff" stroke="#e8590c" strokeWidth={1.5 * s}
                style={{ cursor: 'move' }}
                onPointerDown={(e) => beginDrag(e, { k: 'endpoint', at: p })}
              />
            ))}

          {/* Pending wall segment */}
          {pending && cursor && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={pending.x} y1={pending.y} x2={cursor.x} y2={cursor.y} stroke="#e8590c" strokeWidth={DEFAULT_WALL_MM} opacity={0.4} />
              <text x={(pending.x + cursor.x) / 2} y={(pending.y + cursor.y) / 2 - 8 * s}
                fontSize={13 * s} fill="#e8590c" textAnchor="middle">
                {formatMm(dist(pending, cursor))}
              </text>
            </g>
          )}

          {/* Erase preview */}
          {box && (() => {
            const r = rectOf(box)
            return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.7)"
              stroke="#e8590c" strokeWidth={1.5 * s} strokeDasharray={`${5 * s} ${4 * s}`} style={{ pointerEvents: 'none' }} />
          })()}

          {/* Calibration line */}
          {cal && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={cal.a.x} y1={cal.a.y} x2={cal.b.x} y2={cal.b.y} stroke="#1c7ed6" strokeWidth={2 * s} />
              <circle cx={cal.a.x} cy={cal.a.y} r={4 * s} fill="#1c7ed6" />
              <circle cx={cal.b.x} cy={cal.b.y} r={4 * s} fill="#1c7ed6" />
            </g>
          )}

          {/* Selected object: resize + rotate handles */}
          {selItem && <Handles item={selItem} scale={s} beginDrag={beginDrag} />}

          {/* Note anchor handle */}
          {one && doc.notes.find((n) => n.id === one) && (
            <AnchorHandle note={doc.notes.find((n) => n.id === one)!} scale={s} beginDrag={beginDrag} />
          )}
        </g>
      </svg>

      {/* Typed length entry — the escape hatch from mouse imprecision. */}
      {pending && (
        <div className="length-entry">
          <label>Length</label>
          <input
            autoFocus
            value={lengthInput}
            placeholder={cursor ? String(Math.round(dist(pending, cursor))) : ''}
            onChange={(e) => setLengthInput(e.target.value)}
            onKeyDown={onEntryKey}
          />
          <span>mm</span>
          <label>Angle</label>
          <input
            className="deg"
            value={angleInput}
            placeholder={cursor ? String(Math.round((angleOf(pending, cursor) * 180) / Math.PI)) : ''}
            onChange={(e) => setAngleInput(e.target.value)}
            onKeyDown={onEntryKey}
          />
          <span>°</span>
          <button onClick={() => setPending(null)}>Done</button>
        </div>
      )}

      {/* Note editing happens in a real textarea, not in the SVG. */}
      {editNote && (
        <textarea
          className="note-edit"
          autoFocus
          value={editNote.text}
          onChange={(e) => dispatch({ t: 'patchNote', id: editNote.id, patch: { text: e.target.value }, live: true })}
          onBlur={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ItemView({ item, scale, selected, onDown }: { item: Item; scale: number; selected: boolean; onDown: (e: React.PointerEvent) => void }) {
  const c = catalogOf(item.kind)
  const font = Math.min(11 * scale, item.h * 0.28)
  const showLabel = font * c.label.length * 0.5 < item.w
  const common = {
    fill: selected ? 'rgba(232,89,12,0.12)' : 'rgba(43,108,176,0.10)',
    stroke: selected ? '#e8590c' : '#2b6cb0',
    strokeWidth: 1.5 * scale,
  }
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rot})`} style={{ cursor: 'move' }} onPointerDown={onDown}>
      {c.shape === 'rect' ? (
        <rect x={-item.w / 2} y={-item.h / 2} width={item.w} height={item.h} {...common} />
      ) : (
        <ellipse cx={0} cy={0} rx={item.w / 2} ry={item.h / 2} {...common} />
      )}
      {showLabel && (
        <text y={font * 0.35} fontSize={font} textAnchor="middle" fill="#2b6cb0" style={{ pointerEvents: 'none' }}>
          {c.label}
        </text>
      )}
      {selected && (
        <text y={item.h / 2 + 14 * scale} fontSize={11 * scale} textAnchor="middle" fill="#e8590c" style={{ pointerEvents: 'none' }}>
          {Math.round(item.w)} × {Math.round(item.h)} mm
        </text>
      )}
    </g>
  )
}

/** Naive character-count wrap. ponytail: good enough for sticky notes. */
const wrap = (text: string, charsPerLine: number): string[] =>
  text.split('\n').flatMap((para) => {
    const out: string[] = []
    let line = ''
    for (const word of para.split(' ')) {
      if (line && (line + ' ' + word).length > charsPerLine) {
        out.push(line)
        line = word
      } else line = line ? line + ' ' + word : word
    }
    out.push(line)
    return out
  })

function NoteView({ note, scale, selected, onDown, onEdit }: { note: Note; scale: number; selected: boolean; onDown: (e: React.PointerEvent) => void; onEdit: () => void }) {
  const lines = wrap(note.text || 'Double-click to edit', Math.max(6, Math.floor(note.w / (NOTE_FONT * 0.55))))
  return (
    <g>
      {note.anchor && (
        <line x1={note.x} y1={note.y} x2={note.anchor.x} y2={note.anchor.y} stroke="#868e96" strokeWidth={1.5 * scale} strokeDasharray={`${6 * scale} ${4 * scale}`} />
      )}
      {note.anchor && <circle cx={note.anchor.x} cy={note.anchor.y} r={3 * scale} fill="#868e96" />}
      <g transform={`translate(${note.x - note.w / 2} ${note.y - note.h / 2})`} style={{ cursor: 'move' }} onPointerDown={onDown} onDoubleClick={onEdit}>
        <rect width={note.w} height={note.h} fill={note.color} stroke={selected ? '#e8590c' : 'rgba(0,0,0,0.25)'} strokeWidth={selected ? 2 * scale : 1 * scale} />
        <text x={NOTE_FONT * 0.4} y={NOTE_FONT * 1.1} fontSize={NOTE_FONT} fill="#212529" style={{ pointerEvents: 'none' }}>
          {lines.map((l, i) => (
            <tspan key={i} x={NOTE_FONT * 0.4} dy={i === 0 ? 0 : NOTE_FONT * 1.25}>
              {l}
            </tspan>
          ))}
        </text>
      </g>
    </g>
  )
}

function Handles({ item, scale, beginDrag }: { item: Item; scale: number; beginDrag: (e: React.PointerEvent, d: Drag) => void }) {
  const r = 5 * scale
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const world = (lx: number, ly: number) => rotate({ x: item.x + lx, y: item.y + ly }, { x: item.x, y: item.y }, item.rot)
  const rotHandle = world(0, -item.h / 2 - 26 * scale)
  return (
    <g>
      <line x1={world(0, -item.h / 2).x} y1={world(0, -item.h / 2).y} x2={rotHandle.x} y2={rotHandle.y} stroke="#e8590c" strokeWidth={1.2 * scale} style={{ pointerEvents: 'none' }} />
      <circle cx={rotHandle.x} cy={rotHandle.y} r={r} fill="#e8590c" style={{ cursor: 'grab' }}
        onPointerDown={(e) => beginDrag(e, { k: 'rotate', id: item.id, center: { x: item.x, y: item.y } })}
      />
      {corners.map(([sx, sy]) => {
        const p = world((sx * item.w) / 2, (sy * item.h) / 2)
        const fixed = world((-sx * item.w) / 2, (-sy * item.h) / 2)
        return (
          <rect key={`${sx}${sy}`} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} fill="#fff" stroke="#e8590c" strokeWidth={1.5 * scale}
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => beginDrag(e, { k: 'resize', id: item.id, sx, sy, fixed, rot: item.rot })}
          />
        )
      })}
    </g>
  )
}

function AnchorHandle({ note, scale, beginDrag }: { note: Note; scale: number; beginDrag: (e: React.PointerEvent, d: Drag) => void }) {
  const p = note.anchor ?? { x: note.x + note.w / 2 + 20 * scale, y: note.y }
  return (
    <circle cx={p.x} cy={p.y} r={5 * scale} fill="#fff" stroke="#868e96" strokeWidth={1.5 * scale}
      style={{ cursor: 'crosshair' }}
      onPointerDown={(e) => beginDrag(e, { k: 'note-anchor', id: note.id })}
    />
  )
}
