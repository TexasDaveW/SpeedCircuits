import type { CircuitLesson } from './types'

/** Lesson circuits bundled at build time from `Circuit JSONs/*.json` (lessons 01–53). */
const jsonModules = import.meta.glob('../Circuit JSONs/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

function idFromPath(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.json$/i, '')
}

function orderFromId(id: string): number {
  const match = /^(\d+)-/.exec(id)
  return match ? Number(match[1]) : 999
}

function readName(doc: Record<string, unknown>): string {
  if (typeof doc.name === 'string' && doc.name.trim()) return doc.name.trim()
  const lesson = doc.lesson
  if (lesson && typeof lesson === 'object' && !Array.isArray(lesson)) {
    const title = (lesson as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim()) return title.trim()
  }
  return 'Circuit'
}

function readLesson(doc: Record<string, unknown>): CircuitLesson | undefined {
  const lesson = doc.lesson
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) return undefined
  const raw = lesson as Record<string, unknown>
  const description =
    typeof raw.description === 'string' ? raw.description.trim() : ''
  if (!description) return undefined
  const title =
    typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : undefined
  return { title, description }
}

export interface BuiltinLesson {
  id: string
  order: number
  name: string
  lesson?: CircuitLesson
  document: unknown
}

const BUILTIN_LESSONS: BuiltinLesson[] = (() => {
  const byId = new Map<string, BuiltinLesson>()
  for (const [path, document] of Object.entries(jsonModules)) {
    const id = idFromPath(path)
    const doc =
      document != null && typeof document === 'object' && !Array.isArray(document)
        ? (document as Record<string, unknown>)
        : {}
    byId.set(id, {
      id,
      order: orderFromId(id),
      name: readName(doc),
      lesson: readLesson(doc),
      document,
    })
  }
  return [...byId.values()].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  )
})()

export function listBuiltinLessons(): readonly BuiltinLesson[] {
  return BUILTIN_LESSONS
}

export function getBuiltinLesson(id: string): BuiltinLesson | undefined {
  return BUILTIN_LESSONS.find((l) => l.id === id)
}

/** Resolve `7`, `07`, or `07-rgb-led-color-mixing` to a bundled lesson id. */
export function resolveBuiltinLessonId(param: string): string | undefined {
  const trimmed = param.trim()
  if (!trimmed) return undefined
  const exact = getBuiltinLesson(trimmed)
  if (exact) return exact.id
  const stem = trimmed.replace(/\.json$/i, '')
  const byStem = getBuiltinLesson(stem)
  if (byStem) return byStem.id
  const n = Number(stem)
  if (Number.isInteger(n) && n > 0) {
    return BUILTIN_LESSONS.find((l) => l.order === n)?.id
  }
  const padded = stem.padStart(2, '0')
  return BUILTIN_LESSONS.find((l) => l.id.startsWith(`${padded}-`))?.id
}
