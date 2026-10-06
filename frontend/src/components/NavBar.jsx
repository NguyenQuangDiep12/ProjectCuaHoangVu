import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleLabels = {
  admin: 'Quản trị viên',
  lecturer: 'Giảng viên',
  student: 'Sinh viên'
};

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="topbar card">
      <div>
        <p className="eyebrow">School Management System</p>
        <h1>Hệ thống quản lí sinh viên</h1>
        <p className="topbar-subtitle">Quản lý hồ sơ, bảng điểm và lịch học trên cùng một giao diện.</p>
      </div>

      <div className="topbar-actions">
        <div className="user-chip">
          <div className="user-chip-avatar">{user?.fullName?.charAt(0) || 'U'}</div>
          <div>
            <strong>{user?.fullName}</strong>
            <div className="role-badge">{roleLabels[user?.role] || user?.role}</div>
          </div>
        </div>

        <button className="btn btn-danger" onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
