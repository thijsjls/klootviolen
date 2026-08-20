import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import { contentBounds, PAD_MM, type Bounds, type Doc, type ImageRef } from './model'

/** A round bar length that fits comfortably across the plan. */
const barLength = (widthMm: number): number => {
  const target = widthMm / 5
  const steps = [100, 250, 500, 1000, 2000, 5000, 10_000, 20_000]
  return steps.find((s) => s >= target) ?? steps.at(-1)!
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
  return n
}

/**
 * An exported plan with no scale bar can't be checked by whoever receives it,
 * so both exports get one.
 */
const addScaleBar = (svg: SVGSVGElement, b: Bounds, ratio: number | null) => {
  const L = barLength(b.w)
  const h = Math.max(b.w, b.h) * 0.008
  const x = b.x + PAD_MM
  const y = b.y + b.h - PAD_MM * 0.6

  const g = el('g', {})
  g.appendChild(el('rect', { x, y: y - h, width: L, height: h, fill: '#2f3437' }))
  g.appendChild(el('rect', { x: x + L / 2, y: y - h, width: L / 2, height: h, fill: '#fff', stroke: '#2f3437', 'stroke-width': h * 0.15 }))
  g.appendChild(el('rect', { x, y: y - h, width: L, height: h, fill: 'none', stroke: '#2f3437', 'stroke-width': h * 0.15 }))

  const label = el('text', { x, y: y - h * 1.6, 'font-size': h * 1.6, fill: '#2f3437', 'font-family': 'sans-serif' })
  label.textContent = `0 — ${L >= 1000 ? `${L / 1000} m` : `${L} mm`}${ratio ? `    scale 1:${ratio}` : ''}`
  g.appendChild(label)
  svg.appendChild(g)
}

/** Clone the live SVG, drop the editing overlay, and crop to the content. */
const buildExportSvg = (live: SVGSVGElement, doc: Doc, image: ImageRef | null, ratio: number | null): { svg: SVGSVGElement; b: Bounds } => {
  const svg = live.cloneNode(true) as SVGSVGElement
  svg.querySelector('#overlay')?.remove()
  // The infinite background rect exists only to catch clicks in the editor.
  svg.querySelector('rect')?.setAttribute('display', 'none')

  const b = contentBounds(doc, image)
  svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`)
  svg.removeAttribute('style')
  const bg = el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#ffffff' })
  svg.insertBefore(bg, svg.firstChild)
  addScaleBar(svg, b, ratio)
  return { svg, b }
}

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export const exportPng = async (live: SVGSVGElement, doc: Doc, image: ImageRef | null, pxPerMm = 0.2) => {
  const { svg, b } = buildExportSvg(live, doc, image, null)
  svg.setAttribute('width', String(b.w))
  svg.setAttribute('height', String(b.h))
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))

  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('could not rasterise the plan'))
    img.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(b.w * pxPerMm)
  canvas.height = Math.round(b.h * pxPerMm)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed')
  download(blob, 'floorplan.png')
}

/**
 * True-scale vector PDF. The page is sized in millimetres and the drawing is
 * placed at 1/ratio, so a 3600 mm wall measures 72 mm on paper at 1:50.
 * Sticky notes come through as real text because they are plain SVG.
 */
export const exportPdf = async (live: SVGSVGElement, doc: Doc, image: ImageRef | null, ratio = 50) => {
  const { svg, b } = buildExportSvg(live, doc, image, ratio)
  const pageW = b.w / ratio
  const pageH = b.h / ratio
  if (pageW > 2000 || pageH > 2000) {
    throw new Error(`1:${ratio} needs a ${Math.round(pageW)}×${Math.round(pageH)} mm page. Pick a larger ratio.`)
  }

  svg.setAttribute('width', String(b.w))
  svg.setAttribute('height', String(b.h))
  // svg2pdf measures text, which needs the element in the document.
  svg.style.position = 'fixed'
  svg.style.left = '-99999px'
  document.body.appendChild(svg)
  try {
    const pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageW > pageH ? 'landscape' : 'portrait' })
    await svg2pdf(svg, pdf, { x: 0, y: 0, width: pageW, height: pageH })
    pdf.save('floorplan.pdf')
  } finally {
    svg.remove()
  }
}
