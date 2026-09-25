import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    role: 'student',
    studentCode: '',
    className: '',
    major: '',
    gender: '',
    dob: '',
    phone: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: form
      });
      setSuccess('Đăng ký thành công. Bạn sẽ được chuyển sang trang đăng nhập.');
      setTimeout(() => navigate('/login'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card register-card">
        <h2>Đăng ký</h2>
        <p>Tạo tài khoản lecturer hoặc student</p>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <input name="username" placeholder="Username" value={form.username} onChange={handleChange} required />
          <input type="password" name="password" placeholder="Password" value={form.password} onChange={handleChange} required />
          <input name="fullName" placeholder="Họ và tên" value={form.fullName} onChange={handleChange} required />
          <input type="email" name="email" placeholder="Email" value={form.email} onChange={handleChange} required />

          <select name="role" value={form.role} onChange={handleChange}>
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
          </select>

          {form.role === 'student' && (
            <>
              <input name="studentCode" placeholder="Mã sinh viên" value={form.studentCode} onChange={handleChange} required />
              <input name="className" placeholder="Lớp" value={form.className} onChange={handleChange} />
              <input name="major" placeholder="Ngành học" value={form.major} onChange={handleChange} />
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option value="">Chọn giới tính</option>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
                <option value="Khác">Khác</option>
              </select>
              <input type="date" name="dob" value={form.dob} onChange={handleChange} />
              <input name="phone" placeholder="Số điện thoại" value={form.phone} onChange={handleChange} />
            </>
          )}

          <button className="btn btn-primary full-width" type="submit" disabled={submitting}>
            {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="auth-link">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
