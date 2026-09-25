import { useEffect, useState } from 'react';

const initialForm = {
  studentId: '',
  courseId: '',
  semester: 'HK1 2026',
  midterm: '',
  final: '',
  notes: ''
};

export default function GradeForm({ students, courses, currentGrade, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentGrade) {
      setForm({
        studentId: String(currentGrade.studentId || ''),
        courseId: String(currentGrade.courseId || ''),
        semester: currentGrade.semester || 'HK1 2026',
        midterm: currentGrade.midterm ?? '',
        final: currentGrade.final ?? '',
        notes: currentGrade.notes || ''
      });
      return;
    }

    setForm((prev) => ({
      ...initialForm,
      studentId: students[0] ? String(students[0].id) : '',
      courseId: courses[0] ? String(courses[0].id) : ''
    }));
  }, [currentGrade, students, courses]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      studentId: Number(form.studentId),
      courseId: Number(form.courseId),
      midterm: Number(form.midterm),
      final: Number(form.final)
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentGrade ? 'Cập nhật điểm' : 'Nhập điểm sinh viên'}</h3>
        <p>Chọn sinh viên, môn học và nhập điểm giữa kỳ - cuối kỳ.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <select name="studentId" value={form.studentId} onChange={handleChange} required>
          <option value="">Chọn sinh viên</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.studentCode} - {student.fullName}
            </option>
          ))}
        </select>

        <select name="courseId" value={form.courseId} onChange={handleChange} required>
          <option value="">Chọn môn học</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.courseCode} - {course.courseName}
            </option>
          ))}
        </select>

        <input
          name="semester"
          placeholder="Ví dụ: HK1 2026"
          value={form.semester}
          onChange={handleChange}
          required
        />

        <input
          type="number"
          name="midterm"
          min="0"
          max="10"
          step="0.1"
          placeholder="Điểm giữa kỳ"
          value={form.midterm}
          onChange={handleChange}
          required
        />

        <input
          type="number"
          name="final"
          min="0"
          max="10"
          step="0.1"
          placeholder="Điểm cuối kỳ"
          value={form.final}
          onChange={handleChange}
          required
        />

        <input
          name="notes"
          placeholder="Ghi chú"
          value={form.notes}
          onChange={handleChange}
        />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentGrade ? 'Lưu điểm' : 'Nhập điểm'}
          </button>
          {currentGrade && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
