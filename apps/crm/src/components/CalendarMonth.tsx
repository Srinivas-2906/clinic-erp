import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildMonthGrid,
  clinicTodayYmd,
  formatMonthLabel,
  isSameYmd,
} from '../lib/appointmentDisplay';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  year: number;
  month: number;
  selectedDate: string;
  counts: Record<string, number>;
  onSelectDate: (ymd: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function CalendarMonth({ year, month, selectedDate, counts, onSelectDate, onMonthChange }: Props) {
  const today = clinicTodayYmd();
  const cells = buildMonthGrid(year, month);

  function prevMonth() {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  }

  function nextMonth() {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  }

  function goToday() {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth());
    onSelectDate(today);
  }

  return (
    <div className="calendar-month panel">
      <div className="calendar-month-head">
        <button type="button" className="icon-btn calendar-nav-btn" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-month-title-wrap">
          <span className="calendar-month-title">{formatMonthLabel(year, month)}</span>
          {selectedDate !== today && (
            <button type="button" className="calendar-today-link" onClick={goToday}>
              Jump to today
            </button>
          )}
        </div>
        <button type="button" className="icon-btn calendar-nav-btn" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d} className="calendar-weekday">{d}</span>
        ))}
      </div>

      <div className="calendar-grid" role="grid" aria-label={formatMonthLabel(year, month)}>
        {cells.map((ymd, i) => {
          if (!ymd) {
            return <span key={`pad-${i}`} className="calendar-cell calendar-cell-pad" aria-hidden="true" />;
          }
          const dayNum = Number(ymd.slice(8, 10));
          const count = counts[ymd] ?? 0;
          const isToday = isSameYmd(ymd, today);
          const isSelected = isSameYmd(ymd, selectedDate);
          return (
            <button
              key={ymd}
              type="button"
              role="gridcell"
              className={[
                'calendar-cell',
                isToday ? 'calendar-cell-today' : '',
                isSelected ? 'calendar-cell-selected' : '',
                count > 0 ? 'calendar-cell-has-appts' : '',
              ].filter(Boolean).join(' ')}
              aria-label={`${dayNum}${count ? `, ${count} appointment${count !== 1 ? 's' : ''}` : ', no appointments'}`}
              aria-selected={isSelected}
              onClick={() => onSelectDate(ymd)}
            >
              <span className="calendar-day-num">{dayNum}</span>
              {count > 0 && (
                <span className="calendar-day-badge" aria-hidden="true">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
