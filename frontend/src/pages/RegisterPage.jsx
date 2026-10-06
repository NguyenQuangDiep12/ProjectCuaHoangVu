import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { getBusinessDate } from '../utils/businessDate';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    role: 'student',
    className: '',
    major: '',
    department: '',
    degree: '',
    gender: 'Nam',
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
        <p>Tạo tài khoản sinh viên hoặc giảng viên</p>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <input 
            name="username" 
            placeholder="Username" 
            value={form.username} 
            minLength={12}
            maxLength={50}
            pattern="[A-Za-z0-9_.-]{12,50}"
            onChange={handleChange} 
            required />
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            value={form.password} 
            minLength={6}
            maxLength={30}
            onChange={handleChange} 
            required />
          <input 
            name="fullName" 
            placeholder="Họ và tên"
            value={form.fullName} 
            minLength={12}
            maxLength={50}
            pattern="[A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ '.-]{11,49}"
            onChange={handleChange} 
            required />
          <input 
            type="email" 
            maxLength={254}
            name="email" 
            placeholder="Email" 
            value={form.email}
            onChange={handleChange} 
            required />

          <select name="role" value={form.role} onChange={handleChange}>
            <option value="student">Sinh viên</option>
            <option value="lecturer">Giảng viên</option>
          </select>
          {form.role === 'student' ? (
            <>
              <input name="className" min={8} max={32} placeholder="Lớp" value={form.className} onChange={handleChange} required />
              <input name="major" required placeholder="Ngành học" value={form.major} onChange={handleChange} />
            </>
          ) : (
            <>
              <input name="department" maxLength={80} placeholder="Khoa/Bộ môn" value={form.department} onChange={handleChange} />
              <input name="degree" maxLength={80} placeholder="Học vị" value={form.degree} onChange={handleChange} />
            </>
          )}
          <select name="gender" value={form.gender} onChange={handleChange}>
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
            <option value="Khác">Khác</option>
          </select>
          <input type="date" required name="dob" max={getBusinessDate()} value={form.dob} onChange={handleChange} />
          <input name="phone" type="tel" minLength={9} maxLength={10} placeholder="Số điện thoại" value={form.phone} onChange={handleChange} required />

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
