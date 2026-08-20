import { get, set } from 'idb-keyval'
import { emptyDoc, type Doc, type ImageRef } from './model'

export type SavedFile = { doc: Doc; image: ImageRef | null }

const KEY = 'floorplanner:autosave'

/** Reject anything that is not recognisably one of our files rather than half-loading it. */
const parse = (raw: unknown): SavedFile => {
  const f = raw as Partial<SavedFile>
  if (!f || typeof f !== 'object' || !f.doc || f.doc.version !== 1) {
    throw new Error('Not a Floorplanner file (or made by a newer version).')
  }
  // Fill in anything a future/older field set might be missing.
  return { doc: { ...emptyDoc(), ...f.doc }, image: f.image ?? null }
}

export const saveToFile = (file: SavedFile) => {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plan.floorplan.json'
  a.click()
  URL.revokeObjectURL(url)
}

export const loadFromFile = async (file: File): Promise<SavedFile> => parse(JSON.parse(await file.text()))

// IndexedDB rather than localStorage: an embedded plan image blows past the 5 MB quota.
export const autosave = (file: SavedFile) => set(KEY, file).catch(() => {})

export const loadAutosave = async (): Promise<SavedFile | null> => {
  try {
    const raw = await get(KEY)
    return raw ? parse(raw) : null
  } catch {
    return null
  }
}

/** Read a dropped/picked image into a data URL plus its natural pixel size. */
export const readImage = (file: File): Promise<ImageRef> =>
  new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onerror = () => rej(new Error('could not read that image'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const img = new Image()
      img.onerror = () => rej(new Error('that file is not an image'))
      img.onload = () => res({ dataUrl, wPx: img.naturalWidth, hPx: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
