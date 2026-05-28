function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Read the first image on the system clipboard (requires user gesture + permission). */
export async function readImageFromClipboard(): Promise<string | null> {
  if (!navigator.clipboard?.read) return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((t) => t.startsWith('image/'))
    if (!imageType) continue
    const blob = await item.getType(imageType)
    return blobToDataUrl(blob)
  }
  return null
}

export function readImageFromFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)
  return blobToDataUrl(file)
}
