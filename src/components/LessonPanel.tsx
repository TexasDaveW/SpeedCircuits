interface LessonPanelProps {
  title: string
  description: string | null
}

export function LessonPanel({ title, description }: LessonPanelProps) {
  return (
    <aside className="lesson-panel" aria-label="Lesson notes">
      <h2 className="lesson-panel-title">{title}</h2>
      {description ? (
        <p className="lesson-panel-description">{description}</p>
      ) : (
        <p className="lesson-panel-empty">No lesson notes for this circuit.</p>
      )}
    </aside>
  )
}
