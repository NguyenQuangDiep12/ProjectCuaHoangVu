# PlantUML - Hệ thống quản lý sinh viên

Được dựng từ nghiệp vụ trong `backend/server.js`, `backend/db.js`, và `frontend/src/pages/DashboardPage.jsx`. SRS E-learning đính kèm chỉ dùng làm mẫu tổ chức sơ đồ; các nghiệp vụ bài giảng, bài tập, bình luận, FAQ và khôi phục mật khẩu không thuộc dự án này.

| Tệp | Sơ đồ |
|---|---|
| `01-use-case-tong-quan.puml` | Use case toàn hệ thống |
| `02-use-case-admin.puml` | Phân rã Admin |
| `03-use-case-giang-vien.puml` | Phân rã Giảng viên |
| `04-use-case-sinh-vien.puml` | Phân rã Sinh viên |
| `05-activity-dang-ky-lop-hoc-phan.puml` | Đăng ký lớp học phần và nhánh từ chối |
| `06-activity-nhap-diem.puml` | Nhập điểm, kiểm tra ghi danh, tính tổng/xếp loại |
| `07-class-du-lieu.puml` | Mô hình dữ liệu SQLite chính |

## Quy tắc nghiệp vụ đã phản ánh

- Đăng ký công khai chỉ dành cho `student`/`lecturer`; Admin đăng nhập bằng tài khoản hệ thống.
- Admin/Giảng viên có quyền chung trên một số API; Giảng viên bị giới hạn môn học do mình tạo và lớp mình phụ trách.
- Sinh viên đăng ký lớp khi lớp đang mở, còn chỗ, chưa ghi danh lớp khác cùng môn/học kỳ và không trùng lịch.
- Chỉ chấm điểm sinh viên đã ghi danh môn/học kỳ; tổng điểm = 40% giữa kỳ + 60% cuối kỳ, làm tròn 1 chữ số thập phân.
- `schedules` (lịch học theo lớp) và `sections` (lớp học phần có ghi danh) được mô hình riêng như trong schema.
- API tài khoản hiện chỉ cho Admin xem danh sách (`GET /api/users`), không thể hiện CRUD tài khoản.

Mở các tệp `.puml` bằng PlantUML để xem/kết xuất. Hãy kiểm tra các quy tắc và nhãn vai trò nếu nghiệp vụ mong muốn khác với code hiện tại.
