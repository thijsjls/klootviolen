# klootviolen

> Dan ga je thuis effe lekker met dat plattegrondje zitten klootviolen.

Faffing about with a floor plan, except the measurements are real.

Drop in an image of a plan — estate agent export, scan, photo of a paper one — tell it how long one
dimension you already know is, and from then on every wall you trace and every object you drop is
stored in **real millimetres**. Shove a wall around, check whether the couch actually fits, stick
notes on it for the contractor, export a true-scale PDF.

No backend, no account, nothing uploaded — it all stays in your browser.

**[Open the app →](https://thijsjls.github.io/klootviolen/)**

---

## Measurement model

Everything in the document is millimetres, and the SVG canvas uses **1 user unit = 1 mm**. Pan and
zoom only change the viewBox — they never touch the model. There are exactly two conversions in the
whole codebase, both in [`src/geometry.ts`](src/geometry.ts):

- screen pixels ↔ millimetres, for pointer input and snap radii
- image pixels → millimetres, from calibration

That is what makes the numbers trustworthy: there is nowhere for a scale factor to drift.

**Calibration.** Drag a line across a dimension you know and type the real length (`3.6 m`, `360 cm`,
`3600`). That fixes `mmPerPx` for the document. Recalibrating later rescales the geometry you have
already drawn, so a corrected scale never silently invalidates your work.

**Exact entry everywhere.** While drawing a wall you can type its length and press Enter to commit
that segment at exactly that length. Every selected object exposes its X / Y / width / depth /
rotation as editable millimetre fields. The mouse is never the only way to get a precise number in.

## What you can do

- **Walls** — chained click-to-draw with snapping to existing endpoints, ortho + 45°, and a grid.
  Hold `Alt` to disable snapping. Drag an endpoint to extend or reshape; walls sharing a corner move
  together.
- **Objects** — ~37 presets at real-world sizes: doors, windows, stairs, columns, kitchen blocks and
  islands, appliances, bath, shower, toilet, sink, couches, tables, chairs, beds, wardrobes,
  cupboards, desks. Move, resize (from the object's own axes, even when rotated) and rotate.
- **Sticky notes** — coloured notes with an optional leader line pointing at part of the plan.
- **Export** — PNG, or a **true-scale vector PDF**: at 1:50 a 3600 mm wall measures 72 mm on paper.
  Notes are preserved as selectable text. Both exports carry a scale bar.
- **Save** — a `.floorplan.json` file with the image embedded. Work is also autosaved to IndexedDB.

## Keyboard

| Key | Action |
|---|---|
| `V` / `W` / `N` | select / wall / note tool |
| `Alt` (held) | disable snapping |
| `Shift` (resizing) | keep aspect ratio |
| `Shift` (rotating) | snap to 15° |
| `Shift` + drag | pan |
| `Esc` | end the wall chain / cancel |
| `Delete` | delete selection |
| `Cmd/Ctrl` + `Z` / `Shift` + `Z` | undo / redo |

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/klootviolen/
npm test         # geometry, calibration, snapping, undo
npm run build
```

`examples/test-plan.png` is a synthetic plan built at exactly 20 mm/px, with a 3.60 m and a 12.00 m
dimension marked on it. Calibrate against one and check the other — that catches a bad calibration
that happens to look right locally.

### Layout

| File | Role |
|---|---|
| `src/geometry.ts` | the two unit conversions, snapping, calibration — the tested core |
| `src/model.ts` | document types, the object catalog, reducer, undo stack |
| `src/Canvas.tsx` | the SVG scene and all pointer interaction |
| `src/Inspector.tsx` | object palette and numeric properties |
| `src/export.ts` | PNG and true-scale PDF |
| `src/persist.ts` | file save/load and IndexedDB autosave |

Adding an object type means adding one row to `CATALOG` in `src/model.ts`, not writing a component.

## Not in this version

Automatic wall detection from the image, OCR auto-calibration, door swing arcs, layers, multi-floor,
room area calculation, collaboration. Issues and PRs welcome.

## License

MIT
