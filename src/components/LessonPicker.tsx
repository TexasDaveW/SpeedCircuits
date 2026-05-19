import { listBuiltinLessons } from '../builtinCircuits'

const LESSONS = listBuiltinLessons()

interface LessonPickerProps {
  activeLessonId: string | null
  onSelect: (lessonId: string) => void
}

export function LessonPicker({ activeLessonId, onSelect }: LessonPickerProps) {
  if (LESSONS.length === 0) return null

  return (
    <label className="lesson-picker">
      <span className="lesson-picker-label">
        Built-in lessons <span className="lesson-picker-count">({LESSONS.length})</span>
      </span>
      <select
        value={activeLessonId ?? ''}
        onChange={(e) => {
          const id = e.target.value
          if (id) onSelect(id)
        }}
      >
        <option value="">Choose a lesson…</option>
        {LESSONS.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.order}. {lesson.name}
          </option>
        ))}
      </select>
    </label>
  )
}
