interface Props {
  name?: string | null;
  color?: string;
  compact?: boolean;
  show?: boolean;
}

export function DoctorBadge({ name, color = '#2563eb', compact, show = true }: Props) {
  if (!show || !name) return null;

  return (
    <span className={`tag tag-doctor${compact ? ' tag-xs' : ''}`}>
      <span className="doctor-color-dot" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}
