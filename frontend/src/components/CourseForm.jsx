import { useEffect, useState } from 'react';

const initialForm = {
  courseCode: '',
  courseName: '',
  credits: 3,
  lecturerName: ''
};

export default function CourseForm({ currentCourse, onSubmit, onCancel, defaultLecturerName = '', canEditLecturer = true }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentCourse) {
      setForm({
        courseCode: currentCourse.courseCode || '',
        courseName: currentCourse.courseName || '',
        credits: currentCourse.credits || 3,
        lecturerName: currentCourse.lecturerName || defaultLecturerName || ''
      });
      return;
    }

    setForm({
      ...initialForm,
      lecturerName: defaultLecturerName || ''
    });
  }, [currentCourse, defaultLecturerName]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      credits: Number(form.credits || 0)
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentCourse ? 'Cập nhật môn học' : 'Tạo môn học mới'}</h3>
        <p>Giảng viên có thể tự nhập mã môn và tên môn thay vì chỉ chọn các môn có sẵn.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <input
          name="courseCode"
          placeholder="Mã môn học, ví dụ INT301"
          value={form.courseCode}
          onChange={handleChange}
          required
        />

        <input
          name="courseName"
          placeholder="Tên môn học"
          value={form.courseName}
          onChange={handleChange}
          required
        />

        <input
          type="number"
          min="1"
          name="credits"
          placeholder="Số tín chỉ"
          value={form.credits}
          onChange={handleChange}
          required
        />

        <input
          name="lecturerName"
          placeholder="Giảng viên phụ trách"
          value={form.lecturerName}
          onChange={handleChange}
          disabled={!canEditLecturer}
          required
        />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentCourse ? 'Lưu môn học' : 'Tạo môn học'}
          </button>
          {currentCourse && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
