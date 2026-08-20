import { useEffect, useReducer, useRef, useState } from 'react'
import Canvas, { type Tool } from './Canvas'
import { Palette, Properties } from './Inspector'
import { calibrate, fitView, parseLength, type View } from './geometry'
import { contentBounds, initialState, reducer } from './model'
import { autosave, loadAutosave, loadFromFile, readImage, saveToFile } from './persist'

const RATIOS = [20, 50, 100, 200]

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 4 })
  const [tool, setTool] = useState<Tool>({ t: 'select' })
  const [ratio, setRatio] = useState(50)
  const [busy, setBusy] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileIn = useRef<HTMLInputElement>(null)
  const imgIn = useRef<HTMLInputElement>(null)
  const restored = useRef(false)

  const elSize = () => {
    const r = svgRef.current?.getBoundingClientRect()
    return { width: r?.width || 800, height: r?.height || 600 }
  }

  // Offer to pick up where you left off. Autosave is IndexedDB, so a multi-MB
  // background image is not a problem.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    loadAutosave().then((saved) => {
      if (!saved) return
      const has = saved.doc.walls.length || saved.doc.items.length || saved.doc.notes.length || saved.image
      if (!has) return
      if (!confirm('Restore your last session?')) return
      dispatch({ t: 'load', doc: saved.doc, image: saved.image })
      setView(fitView(contentBounds(saved.doc, saved.image), elSize()))
    })
  }, [])

  // Debounced autosave.
  useEffect(() => {
    const id = setTimeout(() => autosave({ doc: state.doc, image: state.image }), 800)
    return () => clearTimeout(id)
  }, [state.doc, state.image])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ t: e.shiftKey ? 'redo' : 'undo' })
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (state.selection.length) {
          e.preventDefault()
          dispatch({ t: 'delete', ids: state.selection })
        }
      } else if (e.key === 'v') setTool({ t: 'select' })
      else if (e.key === 'w') setTool({ t: 'wall' })
      else if (e.key === 'n') setTool({ t: 'note' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.selection])

  const importImage = async (file: File) => {
    try {
      const image = await readImage(file)
      dispatch({ t: 'setImage', image })
      setView(fitView({ x: 0, y: 0, w: image.wPx * state.doc.mmPerPx, h: image.hPx * state.doc.mmPerPx }, elSize()))
      setTool({ t: 'calibrate' })
    } catch (err) {
      alert(String(err))
    }
  }

  /** The calibration drag measured `measuredMm` under the current scale. */
  const onCalibrated = (measuredMm: number) => {
    const answer = prompt('How long is that line in reality?  e.g. 3.6 m, 360 cm, 3600', '3.6 m')
    if (answer === null) return
    const realMm = parseLength(answer)
    if (realMm === null) {
      alert(`Could not read "${answer}". Use something like 3.6 m, 360 cm or 3600.`)
      return onCalibrated(measuredMm)
    }
    const pixelLength = measuredMm / state.doc.mmPerPx
    const mmPerPx = calibrate(pixelLength, realMm, 'mm')
    const k = mmPerPx / state.doc.mmPerPx
    dispatch({ t: 'calibrate', mmPerPx })
    // Everything just grew by k; grow the view with it so nothing appears to jump.
    setView((v) => ({ cx: v.cx * k, cy: v.cy * k, scale: v.scale * k }))
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(null)
    }
  }

  const need = () => {
    if (!state.doc.calibrated && !confirm('This plan is not calibrated, so its measurements are not real. Export anyway?')) return false
    return true
  }

  return (
    <div className="app">
      <header>
        <strong>Floorplanner</strong>

        <div className="group">
          <button onClick={() => imgIn.current?.click()}>Import plan…</button>
          <button className={tool.t === 'calibrate' ? 'on' : ''} disabled={!state.image} onClick={() => setTool({ t: 'calibrate' })}>
            Set scale
          </button>
        </div>

        <div className="group">
          <button className={tool.t === 'select' ? 'on' : ''} onClick={() => setTool({ t: 'select' })}>Select <kbd>V</kbd></button>
          <button className={tool.t === 'wall' ? 'on' : ''} onClick={() => setTool({ t: 'wall' })}>Wall <kbd>W</kbd></button>
          <button className={tool.t === 'note' ? 'on' : ''} onClick={() => setTool({ t: 'note' })}>Note <kbd>N</kbd></button>
        </div>

        <div className="group">
          <button disabled={!state.past.length} onClick={() => dispatch({ t: 'undo' })}>Undo</button>
          <button disabled={!state.future.length} onClick={() => dispatch({ t: 'redo' })}>Redo</button>
        </div>

        <div className="group">
          <button onClick={() => saveToFile({ doc: state.doc, image: state.image })}>Save</button>
          <button onClick={() => fileIn.current?.click()}>Open</button>
        </div>

        <div className="group">
          <button onClick={() => need() && run('PNG', async () => (await import('./export')).exportPng(svgRef.current!, state.doc, state.image))}>PNG</button>
          <button onClick={() => need() && run('PDF', async () => (await import('./export')).exportPdf(svgRef.current!, state.doc, state.image, ratio))}>PDF</button>
          <select value={ratio} onChange={(e) => setRatio(Number(e.target.value))} title="PDF scale">
            {RATIOS.map((r) => <option key={r} value={r}>1:{r}</option>)}
          </select>
        </div>

        {busy && <span className="busy">exporting {busy}…</span>}
      </header>

      <div
        className="body"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f?.type.startsWith('image/')) importImage(f)
        }}
      >
        <Palette tool={tool} setTool={setTool} />
        <Canvas
          state={state}
          dispatch={dispatch}
          view={view}
          setView={setView}
          tool={tool}
          setTool={setTool}
          svgRef={svgRef}
          onCalibrated={onCalibrated}
        />
        <Properties state={state} dispatch={dispatch} />
      </div>

      <footer>
        {tool.t === 'calibrate' && 'Drag a line across a dimension you know, then type its real length.'}
        {tool.t === 'wall' && 'Click to place corners. Type an exact length and press Enter. Alt disables snapping, Esc ends the chain.'}
        {tool.t === 'place' && 'Click to place the object.'}
        {tool.t === 'note' && 'Click to drop a sticky note.'}
        {tool.t === 'select' && 'Drag to pan, scroll to zoom. Double-click a note to edit it.'}
      </footer>

      <input ref={imgIn} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && importImage(e.target.files[0])} />
      <input ref={fileIn} type="file" accept="application/json,.json" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            const saved = await loadFromFile(f)
            dispatch({ t: 'load', doc: saved.doc, image: saved.image })
            setView(fitView(contentBounds(saved.doc, saved.image), elSize()))
          } catch (err) {
            alert(String(err instanceof Error ? err.message : err))
          }
        }} />
    </div>
  )
}
