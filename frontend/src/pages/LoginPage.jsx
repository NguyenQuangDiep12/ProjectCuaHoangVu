import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(form.username, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb orb-one" />
      <div className="login-bg-orb orb-two" />
      <div className="login-bg-grid" />

      <div className="login-shell">
        <section className="login-hero">
          <span className="login-badge">Student Management System</span>
          <h1>Nền tảng quản lí sinh viên hiện đại, trực quan và chuyên nghiệp</h1>
          <p>
            Hỗ trợ quản trị viên, giảng viên và sinh viên quản lí hồ sơ, đăng ký môn học,
            lịch học, bảng điểm và phản hồi trên cùng một hệ thống.
          </p>

          <div className="login-highlight-grid">
            <div className="login-highlight-card">
              <strong>Quản lí tập trung</strong>
              <span>Thông tin sinh viên, giảng viên, môn học và lớp học phần.</span>
            </div>
            <div className="login-highlight-card">
              <strong>Theo dõi học tập</strong>
              <span>Bảng điểm, lịch học, thời khóa biểu tuần và xuất dữ liệu nhanh.</span>
            </div>
            <div className="login-highlight-card">
              <strong>Phân quyền rõ ràng</strong>
              <span>Admin, lecturer, student với giao diện và chức năng riêng biệt.</span>
            </div>
            <div className="login-highlight-card">
              <strong>Vận hành tiện lợi</strong>
              <span>Thiết kế gọn gàng, hiện đại, phù hợp hệ thống quản lí trường học.</span>
            </div>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-panel-top">
            <div>
              <h2>Đăng nhập</h2>
              <p>Chào mừng bạn quay lại hệ thống quản lí sinh viên.</p>
            </div>
            <div className="login-panel-logo">SMS</div>
          </div>

          {error && <div className="alert error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="login-input-group">
              <label htmlFor="username">Tài khoản</label>
              <input
                id="username"
                type="text"
                name="username"
                placeholder="Nhập username"
                value={form.username}
                onChange={handleChange}
                required
              />
            </div>

            <div className="login-input-group">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                name="password"
                placeholder="Nhập password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            <button className="btn btn-primary full-width login-submit-btn" type="submit" disabled={submitting}>
              {submitting ? 'Đang đăng nhập...' : 'Đăng nhập hệ thống'}
            </button>
          </form>

          <div className="demo-box login-demo-box">
            <p><strong>Tài khoản test</strong></p>
            <div className="login-demo-list">
              <span>admin / admin123</span>
              <span>lecturer1 / lecturer123</span>
              <span>student1 / student123</span>
            </div>
          </div>

          <p className="auth-link">
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
