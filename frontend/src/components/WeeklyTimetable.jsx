const WEEK_DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const PERIODS = [
  { label: 'Tiết 1', start: '06:45', end: '07:45' },
  { label: 'Tiết 2', start: '07:45', end: '08:45' },
  { label: 'Tiết 3', start: '08:45', end: '09:45' },
  { label: 'Tiết 4', start: '09:45', end: '10:45' },
  { label: 'Tiết 5', start: '10:45', end: '11:45' },
  { label: 'Tiết 6', start: '12:30', end: '13:30' },
  { label: 'Tiết 7', start: '13:30', end: '14:30' },
  { label: 'Tiết 8', start: '14:30', end: '15:30' },
  { label: 'Tiết 9', start: '15:30', end: '16:30' },
  { label: 'Tiết 10', start: '16:30', end: '17:30' },
  { label: 'Tiết 11', start: '17:30', end: '18:30' },
  { label: 'Tiết 12', start: '18:30', end: '19:30' },
  { label: 'Tiết 13', start: '19:30', end: '20:30' }
];

function timeToMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function findStartIndex(startTime) {
  const startMinutes = timeToMinutes(startTime);
  const exactIndex = PERIODS.findIndex((period) => timeToMinutes(period.start) === startMinutes);
  if (exactIndex !== -1) return exactIndex;

  for (let index = 0; index < PERIODS.length; index += 1) {
    const current = PERIODS[index];
    const next = PERIODS[index + 1];
    const currentStart = timeToMinutes(current.start);
    const nextStart = next ? timeToMinutes(next.start) : Infinity;

    if (startMinutes >= currentStart && startMinutes < nextStart) {
      return index;
    }
  }

  return 0;
}

function findEndIndex(endTime) {
  const endMinutes = timeToMinutes(endTime);
  const firstAfter = PERIODS.findIndex((period) => timeToMinutes(period.start) >= endMinutes);

  if (firstAfter !== -1) {
    return firstAfter;
  }

  return PERIODS.length;
}

function normalizeSchedules(schedules) {
  return schedules
    .filter((schedule) => WEEK_DAYS.includes(schedule.dayOfWeek))
    .map((schedule) => {
      const startIndex = findStartIndex(schedule.startTime);
      const endIndex = Math.max(startIndex + 1, findEndIndex(schedule.endTime));

      return {
        ...schedule,
        startIndex,
        rowSpan: Math.max(1, endIndex - startIndex)
      };
    });
}

export default function WeeklyTimetable({
  schedules = [],
  title = 'Thời khóa biểu tuần',
  description = 'Bảng tuần hiển thị tự động từ các lớp học phần bạn đã đăng ký.',
  emptyMessage = 'Bạn chưa có môn học nào trong thời khóa biểu tuần.'
}) {
  const normalizedSchedules = normalizeSchedules(schedules);
  const scheduleMap = new Map();
  const blockedCells = new Set();

  normalizedSchedules.forEach((schedule) => {
    const startKey = `${schedule.dayOfWeek}-${schedule.startIndex}`;
    scheduleMap.set(startKey, schedule);

    for (let index = 1; index < schedule.rowSpan; index += 1) {
      blockedCells.add(`${schedule.dayOfWeek}-${schedule.startIndex + index}`);
    }
  });

  return (
    <section className="card compact-card weekly-timetable-card">
      <div className="card-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      {normalizedSchedules.length === 0 ? (
        <div className="empty-weekly-state">{emptyMessage}</div>
      ) : (
        <div className="weekly-timetable-wrapper">
          <table className="weekly-timetable">
            <thead>
              <tr>
                <th className="period-column">Ca học</th>
                {WEEK_DAYS.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period, periodIndex) => (
                <tr key={period.label}>
                  <th className="period-cell">
                    <span>{period.label}</span>
                    <small>{period.start}</small>
                  </th>

                  {WEEK_DAYS.map((day) => {
                    const cellKey = `${day}-${periodIndex}`;

                    if (blockedCells.has(cellKey)) {
                      return null;
                    }

                    const schedule = scheduleMap.get(cellKey);
                    if (!schedule) {
                      return <td key={cellKey} className="weekly-empty-cell" />;
                    }

                    return (
                      <td key={cellKey} rowSpan={schedule.rowSpan} className="weekly-schedule-cell">
                        <div className="weekly-course-name">{schedule.courseName}</div>
                        <div className="weekly-course-code">{schedule.courseCode}</div>
                        <div><strong>Lớp:</strong> {schedule.className}</div>
                        <div><strong>Phòng:</strong> {schedule.room}</div>
                        <div><strong>GV:</strong> {schedule.lecturerName || '--'}</div>
                        <div><strong>Giờ:</strong> {schedule.startTime} - {schedule.endTime}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
