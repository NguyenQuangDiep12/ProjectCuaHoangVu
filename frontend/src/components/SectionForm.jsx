import { useEffect, useState } from 'react';

const initialForm = {
  courseId: '',
  sectionCode: '',
  room: '',
  dayOfWeek: 'Thứ 2',
  startTime: '07:00',
  endTime: '09:00',
  semester: 'HK1 2026',
  maxStudents: 50,
  status: 'open'
};

export default function SectionForm({ courses, currentSection, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentSection) {
      setForm({
        courseId: String(currentSection.courseId || ''),
        sectionCode: currentSection.sectionCode || '',
        room: currentSection.room || '',
        dayOfWeek: currentSection.dayOfWeek || 'Thứ 2',
        startTime: currentSection.startTime || '07:00',
        endTime: currentSection.endTime || '09:00',
        semester: currentSection.semester || 'HK1 2026',
        maxStudents: currentSection.maxStudents || 50,
        status: currentSection.status || 'open'
      });
      return;
    }

    setForm({
      ...initialForm,
      courseId: courses[0] ? String(courses[0].id) : ''
    });
  }, [currentSection, courses]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      courseId: Number(form.courseId),
      maxStudents: Number(form.maxStudents)
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentSection ? 'Cập nhật lớp học phần' : 'Tạo lớp học phần'}</h3>
        <p>Giảng viên tạo lớp để sinh viên có thể tự đăng ký môn học. Bạn có thể thêm môn mới ở mục Môn học.</p>
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
          name="sectionCode"
          placeholder="Mã lớp học phần, ví dụ INT101-01"
          value={form.sectionCode}
          onChange={handleChange}
          required
        />

        <input name="room" placeholder="Phòng học" value={form.room} onChange={handleChange} required />

        <select name="dayOfWeek" value={form.dayOfWeek} onChange={handleChange}>
          {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>

        <input type="time" name="startTime" value={form.startTime} onChange={handleChange} required />
        <input type="time" name="endTime" value={form.endTime} onChange={handleChange} required />
        <input name="semester" placeholder="Ví dụ: HK1 2026" value={form.semester} onChange={handleChange} required />
        <input type="number" min="1" name="maxStudents" placeholder="Sĩ số tối đa" value={form.maxStudents} onChange={handleChange} required />

        <select name="status" value={form.status} onChange={handleChange}>
          <option value="open">Mở đăng ký</option>
          <option value="closed">Đóng đăng ký</option>
        </select>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentSection ? 'Lưu lớp học phần' : 'Tạo lớp học phần'}
          </button>
          {currentSection && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
