const STORAGE_KEY = 'speedcircuits-show-lesson-panel'

export function readLessonPanelVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeLessonPanelVisible(visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, visible ? 'true' : 'false')
  } catch {
    /* ignore quota / private mode */
  }
}
