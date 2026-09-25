import { useEffect, useState } from 'react';

const initialForm = {
  studentCode: '',
  fullName: '',
  email: '',
  className: '',
  major: '',
  gender: '',
  dob: '',
  phone: ''
};

export default function StudentForm({ currentStudent, onSubmit, onCancel, canCreate }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentStudent) {
      setForm({
        studentCode: currentStudent.studentCode || '',
        fullName: currentStudent.fullName || '',
        email: currentStudent.email || '',
        className: currentStudent.className || '',
        major: currentStudent.major || '',
        gender: currentStudent.gender || '',
        dob: currentStudent.dob || '',
        phone: currentStudent.phone || ''
      });
    } else {
      setForm(initialForm);
    }
  }, [currentStudent]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentStudent ? 'Cập nhật hồ sơ sinh viên' : 'Tạo hồ sơ sinh viên'}</h3>
        <p>Quản trị viên có thể thêm mới, giảng viên có thể cập nhật thông tin học tập.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <input
          name="studentCode"
          placeholder="Mã sinh viên"
          value={form.studentCode}
          onChange={handleChange}
          disabled={!canCreate && !currentStudent}
          required
        />
        <input
          name="fullName"
          placeholder="Họ và tên"
          value={form.fullName}
          onChange={handleChange}
          required
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input name="className" placeholder="Lớp" value={form.className} onChange={handleChange} />
        <input name="major" placeholder="Ngành học" value={form.major} onChange={handleChange} />
        <select name="gender" value={form.gender} onChange={handleChange}>
          <option value="">Chọn giới tính</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
          <option value="Khác">Khác</option>
        </select>
        <input name="dob" type="date" value={form.dob} onChange={handleChange} />
        <input name="phone" placeholder="Số điện thoại" value={form.phone} onChange={handleChange} />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentStudent ? 'Lưu hồ sơ' : 'Thêm sinh viên'}
          </button>
          {currentStudent && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
