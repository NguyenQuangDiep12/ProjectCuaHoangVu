import { useEffect, useState } from 'react';
import { addDaysToBusinessDate, getBusinessDate } from '../utils/businessDate';

const weekdays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const dateOffset = (days) => addDaysToBusinessDate(getBusinessDate(), days);

const initialForm = {
  courseId: '',
  className: '',
  building: '',
  room: '',
  dayOfWeek: 'Thứ 2',
  daysOfWeek: ['Thứ 2'],
  startTime: '07:00',
  endTime: '09:00',
  semester: 'HK1 2026',
  startDate: dateOffset(0),
  endDate: dateOffset(120)
};

export default function ScheduleForm({ courses, currentSchedule, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentSchedule) {
      setForm({
        courseId: String(currentSchedule.courseId || ''),
        className: currentSchedule.className || '',
        building: currentSchedule.building || '',
        room: currentSchedule.room || '',
        dayOfWeek: currentSchedule.dayOfWeek || 'Thứ 2',
        daysOfWeek: currentSchedule.dayOfWeek ? [currentSchedule.dayOfWeek] : ['Thứ 2'],
        startTime: currentSchedule.startTime || '07:00',
        endTime: currentSchedule.endTime || '09:00',
        semester: currentSchedule.semester || 'HK1 2026',
        startDate: currentSchedule.startDate || dateOffset(0),
        endDate: currentSchedule.endDate || dateOffset(120)
      });
      return;
    }

    setForm((prev) => ({
      ...initialForm,
      courseId: courses[0] ? String(courses[0].id) : ''
    }));
  }, [currentSchedule, courses]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => name === 'building' ? { ...prev, building: value, room: '' } : { ...prev, [name]: value });
  }

  function toggleDay(day) {
    setForm((prev) => {
      const exists = prev.daysOfWeek.includes(day);
      const nextDays = exists
        ? prev.daysOfWeek.filter((item) => item !== day)
        : [...prev.daysOfWeek, day];

      return {
        ...prev,
        dayOfWeek: exists ? (nextDays[0] || 'Thứ 2') : day,
        daysOfWeek: nextDays.length ? nextDays : ['Thứ 2']
      };
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      courseId: Number(form.courseId),
      daysOfWeek: currentSchedule ? [form.dayOfWeek] : form.daysOfWeek
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentSchedule ? 'Cập nhật lịch học' : 'Tạo lịch học'}</h3>
        <p>Tạo buổi học theo lớp, phòng học và thời gian. Hệ thống sẽ báo nếu bị trùng giờ và bạn có thể chọn nhiều ngày trong tuần khi tạo mới.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <select name="courseId" value={form.courseId} onChange={handleChange} required>
          <option value="">Chọn môn học</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.courseCode} - {course.courseName}
            </option>
          ))}
        </select>

        <input
          name="className"
          placeholder="Lớp, ví dụ CNTT01"
          value={form.className}
          onChange={handleChange}
          required
        />

        <select name="building" value={form.building} onChange={handleChange} required>
          <option value="">Chọn tòa nhà</option>
          {['Khu A', 'Khu B', 'A1', 'Khu C'].map((building) => <option key={building} value={building}>{building}</option>)}
        </select>
        <input name="room" placeholder={form.building ? 'Phòng học' : 'Chọn tòa nhà trước'} value={form.room} onChange={handleChange} disabled={!form.building} required />

        {currentSchedule ? (
          <select name="dayOfWeek" value={form.dayOfWeek} onChange={handleChange}>
            {weekdays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        ) : (
          <div className="weekday-selector">
            <label className="weekday-selector-label">Chọn nhiều ngày học trong tuần</label>
            <div className="weekday-checkbox-grid">
              {weekdays.map((day) => (
                <label key={day} className={`weekday-option ${form.daysOfWeek.includes(day) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.daysOfWeek.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  <span>{day}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <input type="time" name="startTime" value={form.startTime} onChange={handleChange} required />
        <input type="time" name="endTime" value={form.endTime} onChange={handleChange} required />

        <input
          name="semester"
          placeholder="Ví dụ: HK1 2026"
          value={form.semester}
          onChange={handleChange}
          required
        />

        <label>Ngày bắt đầu lịch học<input type="date" name="startDate" value={form.startDate} onChange={handleChange} required /></label>
        <label>Ngày kết thúc lịch học<input type="date" name="endDate" min={form.startDate} value={form.endDate} onChange={handleChange} required /></label>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentSchedule ? 'Lưu lịch học' : 'Tạo lịch học'}
          </button>
          {currentSchedule && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
