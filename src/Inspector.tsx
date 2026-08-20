import { useState } from 'react'
import { angleOf, dist, formatMm, pointAtAngle, pointAtLength } from './geometry'
import {
  CATALOG,
  CATEGORIES,
  catalogOf,
  NOTE_COLORS,
  type Action,
  type State,
} from './model'
import type { Tool } from './Canvas'

/** Commits on blur/Enter so half-typed values like "-" or "3." never reach the model. */
function NumField({ label, value, onChange, suffix = 'mm' }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  const [txt, setTxt] = useState<string | null>(null)
  const commit = () => {
    const n = parseFloat(txt ?? '')
    if (isFinite(n)) onChange(n)
    setTxt(null)
  }
  return (
    <label className="num">
      <span>{label}</span>
      <input
        value={txt ?? String(Math.round(value))}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <em>{suffix}</em>
    </label>
  )
}

export function Palette({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  return (
    <aside className="palette">
      {CATEGORIES.map((cat) => (
        <section key={cat}>
          <h3>{cat}</h3>
          {CATALOG.filter((c) => c.cat === cat).map((c) => (
            <button
              key={c.kind}
              className={tool.t === 'place' && tool.kind === c.kind ? 'on' : ''}
              title={`${c.w} × ${c.h} mm`}
              onClick={() => setTool({ t: 'place', kind: c.kind })}
            >
              <span className={`swatch ${c.shape}`} />
              {c.label}
            </button>
          ))}
        </section>
      ))}
    </aside>
  )
}

export function Properties({ state, dispatch }: { state: State; dispatch: (a: Action) => void }) {
  const { doc, selection } = state
  const id = selection.length === 1 ? selection[0] : null
  const wall = doc.walls.find((w) => w.id === id)
  const item = doc.items.find((i) => i.id === id)
  const note = doc.notes.find((n) => n.id === id)
  const erase = doc.erasures.find((e) => e.id === id)

  return (
    <aside className="props">
      <section>
        <h3>Scale</h3>
        {doc.calibrated ? (
          <p className="scale-readout">
            1 image px = <strong>{doc.mmPerPx.toFixed(3)} mm</strong>
          </p>
        ) : (
          <p className="warn">Not calibrated — measurements are meaningless until you set the scale.</p>
        )}
        <label className="num">
          <span>Grid</span>
          <select
            value={doc.gridMm ?? 0}
            onChange={(e) => dispatch({ t: 'setGrid', gridMm: Number(e.target.value) || null })}
          >
            <option value={0}>off</option>
            {[10, 25, 50, 100, 250].map((g) => (
              <option key={g} value={g}>{g} mm</option>
            ))}
          </select>
        </label>
      </section>

      {erase && (
        <section>
          <h3>Erased area</h3>
          <NumField label="X" value={erase.x} onChange={(n) => dispatch({ t: 'patchErase', id: erase.id, patch: { x: n } })} />
          <NumField label="Y" value={erase.y} onChange={(n) => dispatch({ t: 'patchErase', id: erase.id, patch: { y: n } })} />
          <NumField label="Width" value={erase.w} onChange={(n) => dispatch({ t: 'patchErase', id: erase.id, patch: { w: Math.max(1, n) } })} />
          <NumField label="Height" value={erase.h} onChange={(n) => dispatch({ t: 'patchErase', id: erase.id, patch: { h: Math.max(1, n) } })} />
          <button className="danger" onClick={() => dispatch({ t: 'delete', ids: [erase.id] })}>Restore this area</button>
        </section>
      )}

      {!id && <section><h3>Selection</h3><p className="muted">Nothing selected.</p></section>}

      {wall && (
        <section>
          <h3>Wall</h3>
          <NumField label="Length" value={dist(wall.a, wall.b)} onChange={(n) =>
            dispatch({ t: 'patchWall', id: wall.id, patch: { b: pointAtLength(wall.a, wall.b, Math.max(1, n)) } })
          } />
          <NumField label="Thickness" value={wall.thickness} onChange={(n) =>
            dispatch({ t: 'patchWall', id: wall.id, patch: { thickness: Math.max(10, n) } })
          } />
          {/* Pivots about the wall's first endpoint, exactly as Length extends from it. */}
          <NumField label="Angle" suffix="°" value={(angleOf(wall.a, wall.b) * 180) / Math.PI} onChange={(n) =>
            dispatch({ t: 'patchWall', id: wall.id, patch: { b: pointAtAngle(wall.a, dist(wall.a, wall.b), n) } })
          } />
          <button className="danger" onClick={() => dispatch({ t: 'delete', ids: [wall.id] })}>Delete wall</button>
        </section>
      )}

      {item && (
        <section>
          <h3>{catalogOf(item.kind).label}</h3>
          <NumField label="X" value={item.x} onChange={(n) => dispatch({ t: 'patchItem', id: item.id, patch: { x: n } })} />
          <NumField label="Y" value={item.y} onChange={(n) => dispatch({ t: 'patchItem', id: item.id, patch: { y: n } })} />
          <NumField label="Width" value={item.w} onChange={(n) => dispatch({ t: 'patchItem', id: item.id, patch: { w: Math.max(10, n) } })} />
          <NumField label="Depth" value={item.h} onChange={(n) => dispatch({ t: 'patchItem', id: item.id, patch: { h: Math.max(10, n) } })} />
          <NumField label="Rotation" value={item.rot} suffix="°" onChange={(n) => dispatch({ t: 'patchItem', id: item.id, patch: { rot: n } })} />
          <p className="muted">{formatMm(item.w)} × {formatMm(item.h)}</p>
          <button className="danger" onClick={() => dispatch({ t: 'delete', ids: [item.id] })}>Delete object</button>
        </section>
      )}

      {note && (
        <section>
          <h3>Note</h3>
          <textarea
            rows={5}
            value={note.text}
            placeholder="Type your note…"
            onChange={(e) => dispatch({ t: 'patchNote', id: note.id, patch: { text: e.target.value }, live: true })}
            onBlur={() => dispatch({ t: 'patchNote', id: note.id, patch: {} })}
          />
          <div className="colors">
            {NOTE_COLORS.map((c) => (
              <button key={c} style={{ background: c }} className={note.color === c ? 'on' : ''}
                onClick={() => dispatch({ t: 'patchNote', id: note.id, patch: { color: c } })} />
            ))}
          </div>
          <NumField label="Width" value={note.w} onChange={(n) => dispatch({ t: 'patchNote', id: note.id, patch: { w: Math.max(200, n) } })} />
          <NumField label="Height" value={note.h} onChange={(n) => dispatch({ t: 'patchNote', id: note.id, patch: { h: Math.max(200, n) } })} />
          {note.anchor && (
            <button onClick={() => dispatch({ t: 'patchNote', id: note.id, patch: { anchor: undefined } })}>Remove leader line</button>
          )}
          <button className="danger" onClick={() => dispatch({ t: 'delete', ids: [note.id] })}>Delete note</button>
        </section>
      )}
    </aside>
  )
}
