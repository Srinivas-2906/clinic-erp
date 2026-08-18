interface Props {
  size?: number;
  className?: string;
  /** First letter of clinic name — e.g. "D" for Denta Care */
  monogram?: string;
}

/** Modern clinic monogram — matches dentacare.kaana.in brand mark. */
export function ClinicCareMark({ size = 44, className = '', monogram = 'D' }: Props) {
  const letter = monogram.trim().charAt(0).toUpperCase() || 'C';

  return (
    <span
      className={`clinic-care-mark ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="clinic-care-mark-letter">{letter}</span>
    </span>
  );
}
