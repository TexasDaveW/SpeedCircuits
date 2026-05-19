type SavePickerOptions = {
  suggestedName?: string
  types?: Array<{ description: string; accept: Record<string, string[]> }>
}

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options?: SavePickerOptions & { multiple?: boolean }) => Promise<
    FileSystemFileHandle[]
  >
}

function filePickerWindow(): FilePickerWindow | null {
  const w = window as FilePickerWindow
  if (typeof w.showSaveFilePicker === 'function') return w
  return null
}

/** Safe filename stem from user-visible circuit name */
export function sanitizeCircuitFilename(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'circuit'
  const safe = trimmed
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || 'circuit'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Save JSON; uses native Save dialog when available, else download to default folder. */
export async function saveCircuitJsonFile(
  json: string,
  suggestedName: string,
): Promise<'saved' | 'cancelled' | 'failed'> {
  const filename = `${sanitizeCircuitFilename(suggestedName)}.json`
  const blob = new Blob([json], { type: 'application/json' })

  const w = filePickerWindow()
  if (w?.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'SpeedCircuits circuit',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      return 'saved'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      console.error(e)
      return 'failed'
    }
  }

  downloadBlob(blob, filename)
  return 'saved'
}

/** Open JSON via native picker when available; returns null if API missing (use file input). */
export async function openCircuitJsonFile(): Promise<
  null | 'cancelled' | 'failed' | { text: string; suggestedName: string }
> {
  const w = filePickerWindow()
  if (!w?.showOpenFilePicker) {
    return null
  }

  try {
    const [handle] = await w.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'SpeedCircuits circuit',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    const file = await handle.getFile()
    const text = await file.text()
    const suggestedName = file.name.replace(/\.json$/i, '') || 'circuit'
    return { text, suggestedName }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    console.error(e)
    return 'failed'
  }
}
