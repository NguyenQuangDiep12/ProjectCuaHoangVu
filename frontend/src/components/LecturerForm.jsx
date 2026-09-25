import { useEffect, useState } from 'react';

const initialForm = {
  lecturerCode: '',
  fullName: '',
  email: '',
  username: '',
  password: '',
  department: '',
  degree: '',
  gender: '',
  dob: '',
  phone: ''
};

export default function LecturerForm({ currentLecturer, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentLecturer) {
      setForm({
        lecturerCode: currentLecturer.lecturerCode || '',
        fullName: currentLecturer.fullName || '',
        email: currentLecturer.email || '',
        username: currentLecturer.username || '',
        password: '',
        department: currentLecturer.department || '',
        degree: currentLecturer.degree || '',
        gender: currentLecturer.gender || '',
        dob: currentLecturer.dob || '',
        phone: currentLecturer.phone || ''
      });
      return;
    }

    setForm(initialForm);
  }, [currentLecturer]);

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
        <h3>{currentLecturer ? 'Cập nhật hồ sơ giảng viên' : 'Thêm giảng viên mới'}</h3>
        <p>Admin có thể cấp mã giảng viên, tạo tài khoản và quản lý đầy đủ thông tin giảng viên.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <input
          name="lecturerCode"
          placeholder="Mã giảng viên, ví dụ GV010"
          value={form.lecturerCode}
          onChange={handleChange}
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
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="username"
          placeholder="Username đăng nhập"
          value={form.username}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder={currentLecturer ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}
          value={form.password}
          onChange={handleChange}
          required={!currentLecturer}
        />
        <input
          name="department"
          placeholder="Khoa/Bộ môn"
          value={form.department}
          onChange={handleChange}
        />
        <input
          name="degree"
          placeholder="Học vị"
          value={form.degree}
          onChange={handleChange}
        />
        <select name="gender" value={form.gender} onChange={handleChange}>
          <option value="">Chọn giới tính</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
          <option value="Khác">Khác</option>
        </select>
        <input type="date" name="dob" value={form.dob} onChange={handleChange} />
        <input
          name="phone"
          placeholder="Số điện thoại"
          value={form.phone}
          onChange={handleChange}
        />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentLecturer ? 'Lưu giảng viên' : 'Thêm giảng viên'}
          </button>
          {currentLecturer && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
