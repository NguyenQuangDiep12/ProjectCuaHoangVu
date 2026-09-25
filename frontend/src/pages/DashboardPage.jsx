import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api';
import CourseForm from '../components/CourseForm';
import LecturerForm from '../components/LecturerForm';
import GradeForm from '../components/GradeForm';
import NavBar from '../components/NavBar';
import RoleSidebar from '../components/RoleSidebar';
import ScheduleForm from '../components/ScheduleForm';
import SectionForm from '../components/SectionForm';
import StudentForm from '../components/StudentForm';
import WeeklyTimetable from '../components/WeeklyTimetable';
import { useAuth } from '../context/AuthContext';

const roleSections = {
  admin: [
    { key: 'overview', label: 'Tổng quan', description: 'Thống kê hệ thống và dữ liệu nhanh' },
    { key: 'students', label: 'Hồ sơ sinh viên', description: 'Thêm, sửa, xóa thông tin sinh viên' },
    { key: 'lecturers', label: 'Hồ sơ giảng viên', description: 'Thêm, sửa, xóa giảng viên và cấp mã giảng viên' },
    { key: 'courses', label: 'Môn học', description: 'Tạo môn học mới bằng cách nhập trực tiếp từ bàn phím' },
    { key: 'grades', label: 'Nhập điểm', description: 'Quản lý bảng điểm theo môn học' },
    { key: 'schedules', label: 'Lịch học', description: 'Tạo và cập nhật thời khóa biểu' },
    { key: 'sections', label: 'Lớp học phần', description: 'Theo dõi lớp giảng viên tạo và số lượng đăng ký' },
    { key: 'feedbacks', label: 'Ý kiến sinh viên', description: 'Xem và phản hồi ý kiến gửi trực tiếp tới admin' },
    { key: 'news', label: 'Tin tức', description: 'Đăng và quản lý thông báo để giảng viên, sinh viên cùng theo dõi' },
    { key: 'users', label: 'Tài khoản', description: 'Theo dõi người dùng trong hệ thống' }
  ],
  lecturer: [
    { key: 'overview', label: 'Tổng quan', description: 'Xem thống kê học tập' },
    { key: 'students', label: 'Hồ sơ sinh viên', description: 'Cập nhật hồ sơ học tập' },
    { key: 'courses', label: 'Môn học', description: 'Tự tạo môn học mới trước khi mở lớp học phần' },
    { key: 'grades', label: 'Nhập điểm', description: 'Nhập và chỉnh sửa điểm số' },
    { key: 'schedules', label: 'Lịch học', description: 'Tạo lịch học cho lớp' },
    { key: 'weeklySchedule', label: 'Thời khóa biểu tuần', description: 'Xem lịch giảng dạy trong tuần từ các lớp học phần đã tạo' },
    { key: 'sections', label: 'Lớp học phần', description: 'Tạo lớp để sinh viên tự đăng ký môn học' },
    { key: 'news', label: 'Tin tức', description: 'Theo dõi các thông báo mới nhất từ admin' }
  ],
  student: [
    { key: 'overview', label: 'Tổng quan', description: 'Thông tin nhanh về học tập' },
    { key: 'profile', label: 'Thông tin cá nhân', description: 'Xem hồ sơ cá nhân' },
    { key: 'grades', label: 'Điểm số', description: 'Xem dashboard bảng điểm và kết quả học tập' },
    { key: 'gradeExport', label: 'Xuất điểm Excel', description: 'Tải bảng điểm cá nhân ra file Excel để lưu trữ' },
    { key: 'schedule', label: 'Lịch học', description: 'Lịch học tự động hiển thị theo môn đã đăng ký' },
    { key: 'weeklySchedule', label: 'Thời khóa biểu tuần', description: 'Xem thời khóa biểu tuần dạng lưới theo môn đã đăng ký' },
    { key: 'registration', label: 'Đăng ký môn', description: 'Đăng ký hoặc hủy đăng ký lớp học phần' },
    { key: 'news', label: 'Tin tức', description: 'Xem các thông báo mới nhất từ admin' },
    { key: 'feedback', label: 'Gửi ý kiến', description: 'Gửi phản hồi hoặc kiến nghị trực tiếp cho admin' }
  ]
};

function formatRole(role) {
  const roleMap = {
    admin: 'Quản trị viên',
    lecturer: 'Giảng viên',
    student: 'Sinh viên'
  };

  return roleMap[role] || role;
}

function formatFeedbackStatus(status) {
  const map = {
    new: 'Mới',
    in_progress: 'Đang xử lý',
    resolved: 'Đã phản hồi'
  };

  return map[status] || status;
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [users, setUsers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [grades, setGrades] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [newsList, setNewsList] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingLecturer, setEditingLecturer] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingGrade, setEditingGrade] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [editingFeedback, setEditingFeedback] = useState(null);
  const [editingNews, setEditingNews] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [lecturerSearch, setLecturerSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [gradeSearch, setGradeSearch] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [newsSearch, setNewsSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');
  const [feedbackForm, setFeedbackForm] = useState({ subject: '', message: '' });
  const [replyForm, setReplyForm] = useState({ adminReply: '', status: 'in_progress' });

  const isAdmin = user?.role === 'admin';
  const isLecturer = user?.role === 'lecturer';
  const isStudent = user?.role === 'student';

  useEffect(() => {
    const sections = roleSections[user?.role] || [];
    if (sections[0]) {
      setActiveSection(sections[0].key);
    }
  }, [user?.role]);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      if (isAdmin || isLecturer) {
        const [studentsData, lecturersData, statsData, usersData, coursesData, gradesData, schedulesData, sectionsData, feedbackData, newsData] = await Promise.all([
          apiRequest('/students', { token }),
          isAdmin ? apiRequest('/lecturers', { token }) : Promise.resolve([]),
          apiRequest('/stats', { token }),
          isAdmin ? apiRequest('/users', { token }) : Promise.resolve([]),
          apiRequest('/courses', { token }),
          apiRequest('/grades', { token }),
          apiRequest('/schedules', { token }),
          apiRequest('/sections', { token }),
          isAdmin ? apiRequest('/feedbacks', { token }) : Promise.resolve([]),
          apiRequest('/news', { token })
        ]);

        setStudents(studentsData);
        setLecturers(lecturersData);
        setStats(statsData);
        setUsers(usersData);
        setCourses(coursesData);
        setGrades(gradesData);
        setSchedules(schedulesData);
        setSectionsList(sectionsData);
        setFeedbacks(feedbackData);
        setNewsList(newsData);
      }

      if (isStudent) {
        const [profileData, coursesData, gradesData, schedulesData, sectionsData, feedbackData, newsData] = await Promise.all([
          apiRequest('/students/me', { token }),
          apiRequest('/courses', { token }),
          apiRequest('/grades/me', { token }),
          apiRequest('/schedules/me', { token }),
          apiRequest('/sections', { token }),
          apiRequest('/feedbacks/me', { token }),
          apiRequest('/news', { token })
        ]);

        setProfile(profileData);
        setCourses(coursesData);
        setGrades(gradesData);
        setSchedules(schedulesData);
        setSectionsList(sectionsData);
        setFeedbacks(feedbackData);
        setNewsList(newsData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role) {
      loadData();
    }
  }, [user?.role]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  const sections = roleSections[user?.role] || [];

  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return students;

    return students.filter((student) =>
      [student.studentCode, student.fullName, student.email, student.className, student.major]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [studentSearch, students]);

  const filteredLecturers = useMemo(() => {
    const keyword = lecturerSearch.trim().toLowerCase();
    if (!keyword) return lecturers;

    return lecturers.filter((lecturer) =>
      [lecturer.lecturerCode, lecturer.fullName, lecturer.email, lecturer.username, lecturer.department, lecturer.degree]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [lecturerSearch, lecturers]);

  const filteredCourses = useMemo(() => {
    const keyword = courseSearch.trim().toLowerCase();
    if (!keyword) return courses;

    return courses.filter((course) =>
      [course.courseCode, course.courseName, course.lecturerName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [courseSearch, courses]);

  const filteredGrades = useMemo(() => {
    const keyword = gradeSearch.trim().toLowerCase();
    if (!keyword) return grades;

    return grades.filter((grade) =>
      [grade.studentCode, grade.fullName, grade.courseCode, grade.courseName, grade.semester]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [gradeSearch, grades]);

  const filteredSchedules = useMemo(() => {
    const keyword = scheduleSearch.trim().toLowerCase();
    if (!keyword) return schedules;

    return schedules.filter((schedule) =>
      [schedule.className, schedule.courseCode, schedule.courseName, schedule.room, schedule.semester, schedule.dayOfWeek]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [scheduleSearch, schedules]);

  const filteredSections = useMemo(() => {
    const keyword = sectionSearch.trim().toLowerCase();
    if (!keyword) return sectionsList;

    return sectionsList.filter((section) =>
      [section.sectionCode, section.courseCode, section.courseName, section.semester, section.room, section.dayOfWeek, section.lecturerName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [sectionSearch, sectionsList]);


  const filteredNews = useMemo(() => {
    const keyword = newsSearch.trim().toLowerCase();
    if (!keyword) return newsList;

    return newsList.filter((news) =>
      [news.title, news.summary, news.content, news.category, news.createdByName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [newsSearch, newsList]);

  const filteredFeedbacks = useMemo(() => {
    const keyword = feedbackSearch.trim().toLowerCase();
    if (!keyword) return feedbacks;

    return feedbacks.filter((feedback) =>
      [feedback.subject, feedback.message, feedback.adminReply, feedback.fullName, feedback.studentCode, feedback.className]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [feedbackSearch, feedbacks]);

  const averageGrade = useMemo(() => {
    if (!grades.length) return 0;
    const total = grades.reduce((sum, item) => sum + Number(item.total || 0), 0);
    return Math.round((total / grades.length) * 10) / 10;
  }, [grades]);

  const passedGrades = useMemo(
    () => grades.filter((item) => Number(item.total || 0) >= 4),
    [grades]
  );

  const earnedCredits = useMemo(
    () => passedGrades.reduce((sum, item) => sum + Number(item.credits || 0), 0),
    [passedGrades]
  );

  const highestGrade = useMemo(() => {
    if (!grades.length) return null;
    return [...grades].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  }, [grades]);

  const registeredSections = useMemo(
    () => sectionsList.filter((section) => Number(section.isRegistered) === 1),
    [sectionsList]
  );

  const lecturerTeachingSections = useMemo(
    () => sectionsList.filter((section) => Number(section.lecturerId) === Number(user?.id)),
    [sectionsList, user?.id]
  );

  const lecturerWeeklySchedules = useMemo(
    () => schedules.filter((schedule) => Number(schedule.createdBy) === Number(user?.id)),
    [schedules, user?.id]
  );

  const openFeedbackCount = useMemo(
    () => feedbacks.filter((item) => item.status !== 'resolved').length,
    [feedbacks]
  );

  const summaryCards = useMemo(() => {
    if (isStudent) {
      return [
        { label: 'Lớp học', value: profile?.className || '--', helper: 'Lớp hiện tại' },
        { label: 'Môn đã có điểm', value: grades.length, helper: 'Bản ghi kết quả học tập' },
        { label: 'Điểm trung bình', value: averageGrade || '--', helper: 'Tổng kết trung bình hiện tại' },
        { label: 'Tín chỉ đạt', value: earnedCredits, helper: 'Tính từ các môn đã qua' },
        { label: 'Đã đăng ký', value: registeredSections.length, helper: 'Số lớp học phần đã đăng ký' },
        { label: 'Ý kiến đã gửi', value: feedbacks.length, helper: 'Phản hồi gửi đến admin' },
        { label: 'Tin tức mới', value: newsList.length, helper: 'Thông báo admin đã đăng' }
      ];
    }

    if (!stats) return [];

    return [
      { label: 'Sinh viên', value: stats.totalStudents, helper: 'Tổng hồ sơ sinh viên' },
      { label: 'Người dùng', value: stats.totalUsers, helper: 'Tài khoản đăng nhập' },
      { label: 'Giảng viên', value: stats.totalLecturers, helper: 'Tài khoản giảng viên' },
      { label: 'Môn học', value: stats.totalCourses, helper: 'Môn học trong hệ thống' },
      { label: 'Lớp học phần', value: stats.totalSections || 0, helper: 'Lớp do giảng viên tạo' },
      { label: 'Lượt đăng ký', value: stats.totalEnrollments || 0, helper: 'Tổng sinh viên đăng ký môn' },
      { label: 'Ý kiến sinh viên', value: stats.totalFeedbacks || 0, helper: 'Tổng phản hồi gửi cho admin' },
      { label: 'Chưa xử lý', value: stats.openFeedbacks || 0, helper: 'Ý kiến cần admin xem' },
      { label: 'Tin tức', value: stats.totalNews || 0, helper: 'Số thông báo đã công bố' },
      { label: 'Điểm TB hệ thống', value: stats.averageGrade, helper: 'Trung bình toàn bộ điểm' }
    ];
  }, [averageGrade, earnedCredits, feedbacks.length, grades.length, isStudent, newsList.length, profile?.className, registeredSections.length, stats]);

  async function handleCreateOrUpdateStudent(formData) {
    setError('');
    try {
      if (editingStudent) {
        const data = await apiRequest(`/students/${editingStudent.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingStudent(null);
      } else {
        const data = await apiRequest('/students', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
      if (isLecturer) {
        setActiveSection('weeklySchedule');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateOrUpdateLecturer(formData) {
    setError('');
    try {
      if (editingLecturer) {
        const data = await apiRequest(`/lecturers/${editingLecturer.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingLecturer(null);
      } else {
        const data = await apiRequest('/lecturers', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
      setActiveSection('lecturers');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteLecturer(lecturerId) {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa giảng viên này?');
    if (!confirmed) return;

    setError('');
    try {
      const data = await apiRequest(`/lecturers/${lecturerId}`, {
        method: 'DELETE',
        token
      });
      setMessage(data.message);
      setEditingLecturer(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteStudent(studentId) {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa sinh viên này?');
    if (!confirmed) return;

    setError('');
    try {
      const data = await apiRequest(`/students/${studentId}`, {
        method: 'DELETE',
        token
      });
      setMessage(data.message);
      setEditingStudent(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateOrUpdateCourse(formData) {
    setError('');
    try {
      const payload = {
        ...formData,
        lecturerName: isLecturer ? (user?.fullName || formData.lecturerName) : formData.lecturerName
      };

      if (editingCourse) {
        const data = await apiRequest(`/courses/${editingCourse.id}`, {
          method: 'PUT',
          body: payload,
          token
        });
        setMessage(data.message);
        setEditingCourse(null);
      } else {
        const data = await apiRequest('/courses', {
          method: 'POST',
          body: payload,
          token
        });
        setMessage(data.message);
      }

      await loadData();
      setActiveSection(isLecturer ? 'sections' : 'courses');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteCourse(id) {
    const confirmed = window.confirm('Bạn có chắc muốn xóa môn học này?');
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/courses/${id}`, { method: 'DELETE', token });
      setMessage(data.message);
      setEditingCourse(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateOrUpdateGrade(formData) {
    setError('');
    try {
      if (editingGrade) {
        const data = await apiRequest(`/grades/${editingGrade.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingGrade(null);
      } else {
        const data = await apiRequest('/grades', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteGrade(id) {
    const confirmed = window.confirm('Bạn có chắc muốn xóa bản ghi điểm này?');
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/grades/${id}`, { method: 'DELETE', token });
      setMessage(data.message);
      setEditingGrade(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateOrUpdateSchedule(formData) {
    setError('');
    try {
      if (editingSchedule) {
        const data = await apiRequest(`/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingSchedule(null);
      } else {
        const data = await apiRequest('/schedules', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
      if (isLecturer) {
        setActiveSection('weeklySchedule');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSchedule(id) {
    const confirmed = window.confirm('Bạn có chắc muốn xóa lịch học này?');
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/schedules/${id}`, { method: 'DELETE', token });
      setMessage(data.message);
      setEditingSchedule(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateOrUpdateSection(formData) {
    setError('');
    try {
      if (editingSection) {
        const data = await apiRequest(`/sections/${editingSection.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingSection(null);
      } else {
        const data = await apiRequest('/sections', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
      if (isLecturer) {
        setActiveSection('weeklySchedule');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSection(id) {
    const confirmed = window.confirm('Bạn có chắc muốn xóa lớp học phần này?');
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/sections/${id}`, { method: 'DELETE', token });
      setMessage(data.message);
      setEditingSection(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRegisterSection(id) {
    try {
      const data = await apiRequest(`/sections/${id}/register`, { method: 'POST', token });
      setMessage(`${data.message} Lịch học cá nhân đã được cập nhật.`);
      await loadData();
      setActiveSection('weeklySchedule');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUnregisterSection(id) {
    try {
      const data = await apiRequest(`/sections/${id}/register`, { method: 'DELETE', token });
      setMessage(data.message);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }


  async function handleCreateOrUpdateNews(formData) {
    setError('');
    try {
      if (editingNews) {
        const data = await apiRequest(`/news/${editingNews.id}`, {
          method: 'PUT',
          body: formData,
          token
        });
        setMessage(data.message);
        setEditingNews(null);
      } else {
        const data = await apiRequest('/news', {
          method: 'POST',
          body: formData,
          token
        });
        setMessage(data.message);
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteNews(id) {
    const confirmed = window.confirm('Bạn có chắc muốn xóa tin tức này?');
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/news/${id}`, { method: 'DELETE', token });
      setMessage(data.message);
      setEditingNews(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmitFeedback(event) {
    event.preventDefault();
    setError('');

    try {
      const data = await apiRequest('/feedbacks', {
        method: 'POST',
        body: feedbackForm,
        token
      });
      setMessage(data.message);
      setFeedbackForm({ subject: '', message: '' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReplyFeedback(event) {
    event.preventDefault();
    if (!editingFeedback) return;

    setError('');
    try {
      const data = await apiRequest(`/feedbacks/${editingFeedback.id}/reply`, {
        method: 'PUT',
        body: replyForm,
        token
      });
      setMessage(data.message);
      setEditingFeedback(null);
      setReplyForm({ adminReply: '', status: 'in_progress' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function startReplyFeedback(feedback) {
    setEditingFeedback(feedback);
    setReplyForm({
      adminReply: feedback.adminReply || '',
      status: feedback.status || 'in_progress'
    });
  }

  function handleExportGradesExcel() {
    if (!grades.length) {
      setError('Chưa có dữ liệu điểm để xuất file Excel.');
      return;
    }

    const exportRows = grades.map((grade, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(grade.courseCode)}</td>
        <td>${escapeHtml(grade.courseName)}</td>
        <td>${escapeHtml(grade.credits || 0)}</td>
        <td>${escapeHtml(grade.lecturerName || '--')}</td>
        <td>${escapeHtml(grade.semester)}</td>
        <td>${escapeHtml(grade.midterm ?? '--')}</td>
        <td>${escapeHtml(grade.final ?? '--')}</td>
        <td>${escapeHtml(grade.total ?? '--')}</td>
        <td>${escapeHtml(grade.letterGrade || '--')}</td>
        <td>${escapeHtml(grade.notes || '--')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1, h2, p { margin: 0 0 10px; }
            .summary { margin: 18px 0; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #9ca3af; padding: 8px 10px; text-align: left; }
            th { background: #dbeafe; }
          </style>
        </head>
        <body>
          <h1>Bảng điểm sinh viên</h1>
          <p><strong>Họ tên:</strong> ${escapeHtml(profile?.fullName || user?.fullName || '--')}</p>
          <p><strong>Mã sinh viên:</strong> ${escapeHtml(profile?.studentCode || user?.studentCode || '--')}</p>
          <p><strong>Lớp:</strong> ${escapeHtml(profile?.className || '--')}</p>
          <p><strong>Ngành:</strong> ${escapeHtml(profile?.major || '--')}</p>
          <div class="summary">
            <p><strong>Điểm trung bình:</strong> ${escapeHtml(averageGrade || '--')}</p>
            <p><strong>Số môn đạt:</strong> ${escapeHtml(passedGrades.length)}</p>
            <p><strong>Tín chỉ tích lũy:</strong> ${escapeHtml(earnedCredits)}</p>
            <p><strong>Ngày xuất:</strong> ${escapeHtml(new Date().toLocaleString('vi-VN'))}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã môn</th>
                <th>Tên môn</th>
                <th>Tín chỉ</th>
                <th>Giảng viên</th>
                <th>Học kỳ</th>
                <th>Giữa kỳ</th>
                <th>Cuối kỳ</th>
                <th>Tổng kết</th>
                <th>Điểm chữ</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>${exportRows}</tbody>
          </table>
        </body>
      </html>`;

    const blob = new Blob(['\ufeff', html], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bang-diem-${profile?.studentCode || user?.username || 'sinh-vien'}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setMessage('Đã xuất bảng điểm ra file Excel thành công.');
  }

  function renderSummaryCards() {
    return (
      <section className="stats-grid">
        {summaryCards.map((item) => (
          <div className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </section>
    );
  }

  function renderOverviewSection() {
    if (isStudent) {
      return (
        <>
          {renderSummaryCards()}
          <section className="dashboard-grid two-columns">
            <div className="card profile-card compact-card">
              <div className="card-header">
                <h3>Thông tin nhanh</h3>
                <p>Thông tin cá nhân và trạng thái học tập hiện tại.</p>
              </div>
              {profile && (
                <div className="profile-grid">
                  <div><strong>Mã sinh viên:</strong> {profile.studentCode}</div>
                  <div><strong>Họ tên:</strong> {profile.fullName}</div>
                  <div><strong>Email:</strong> {profile.email}</div>
                  <div><strong>Lớp:</strong> {profile.className}</div>
                  <div><strong>Ngành:</strong> {profile.major}</div>
                  <div><strong>Số điện thoại:</strong> {profile.phone || '--'}</div>
                </div>
              )}
            </div>

            <div className="card compact-card">
              <div className="card-header">
                <h3>Dashboard bảng điểm</h3>
                <p>Tóm tắt điểm số để bạn theo dõi nhanh kết quả học tập.</p>
              </div>
              <div className="profile-grid">
                <div><strong>Điểm trung bình:</strong> {averageGrade || '--'}</div>
                <div><strong>Số môn đạt:</strong> {passedGrades.length}</div>
                <div><strong>Tín chỉ tích lũy:</strong> {earnedCredits}</div>
                <div><strong>Môn cao nhất:</strong> {highestGrade ? `${highestGrade.courseCode} (${highestGrade.total})` : '--'}</div>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Môn học</th>
                      <th>Học kỳ</th>
                      <th>Tổng kết</th>
                      <th>Chữ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.slice(0, 5).map((grade) => (
                      <tr key={grade.id}>
                        <td>{grade.courseName}</td>
                        <td>{grade.semester}</td>
                        <td>{grade.total}</td>
                        <td><span className="pill success">{grade.letterGrade}</span></td>
                      </tr>
                    ))}
                    {grades.length === 0 && (
                      <tr>
                        <td colSpan="4" className="empty-cell">Chưa có dữ liệu điểm số.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>


          <section className="card compact-card">
            <div className="card-header">
              <h3>Tin tức mới nhất</h3>
              <p>Các thông báo gần đây từ admin để bạn theo dõi nhanh.</p>
            </div>
            <div className="news-mini-list">
              {newsList.slice(0, 3).map((news) => (
                <article key={news.id} className="news-mini-item">
                  <div className="news-mini-top">
                    <span className={`pill ${Number(news.isImportant) === 1 ? 'danger' : 'neutral'}`}>
                      {Number(news.isImportant) === 1 ? 'Quan trọng' : (news.category || 'Thông báo')}
                    </span>
                    <small>{formatDateTime(news.createdAt)}</small>
                  </div>
                  <strong>{news.title}</strong>
                  <p>{news.summary || news.content}</p>
                </article>
              ))}
              {newsList.length === 0 && <p className="empty-cell">Chưa có tin tức nào từ admin.</p>}
            </div>
          </section>

          <section className="dashboard-grid two-columns">
            <div className="card compact-card">
              <div className="card-header">
                <h3>Lớp học phần đã đăng ký</h3>
                <p>Các lớp bạn đã chọn sẽ tự động hiện ở mục lịch học.</p>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Mã lớp</th>
                      <th>Môn học</th>
                      <th>Giảng viên</th>
                      <th>Sĩ số</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredSections.slice(0, 5).map((section) => (
                      <tr key={section.id}>
                        <td>{section.sectionCode}</td>
                        <td>{section.courseName}</td>
                        <td>{section.lecturerName}</td>
                        <td>{section.enrollmentCount}/{section.maxStudents}</td>
                      </tr>
                    ))}
                    {registeredSections.length === 0 && (
                      <tr>
                        <td colSpan="4" className="empty-cell">Bạn chưa đăng ký lớp học phần nào.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card compact-card">
              <div className="card-header">
                <h3>Lịch học sắp tới</h3>
                <p>Lịch học lấy trực tiếp từ các môn bạn đã đăng ký.</p>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Môn học</th>
                      <th>Giảng viên</th>
                      <th>Ca học</th>
                      <th>Phòng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.slice(0, 5).map((schedule) => (
                      <tr key={`${schedule.id}-${schedule.courseCode}`}>
                        <td>{schedule.courseCode} - {schedule.courseName}</td>
                        <td>{schedule.lecturerName || '--'}</td>
                        <td>{schedule.dayOfWeek}, {schedule.startTime} - {schedule.endTime}</td>
                        <td>{schedule.room}</td>
                      </tr>
                    ))}
                    {schedules.length === 0 && (
                      <tr>
                        <td colSpan="4" className="empty-cell">Chưa có lịch học từ môn đã đăng ký.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      );
    }

    return (
      <>
        {renderSummaryCards()}
        <section className="dashboard-grid two-columns">
          <div className="card compact-card">
            <div className="card-header">
              <h3>Sinh viên mới nhất</h3>
              <p>Danh sách hồ sơ sinh viên vừa có trong hệ thống.</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã SV</th>
                    <th>Họ tên</th>
                    <th>Lớp</th>
                    <th>Ngành</th>
                  </tr>
                </thead>
                <tbody>
                  {students.slice(0, 5).map((student) => (
                    <tr key={student.id}>
                      <td>{student.studentCode}</td>
                      <td>{student.fullName}</td>
                      <td>{student.className}</td>
                      <td>{student.major}</td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan="4" className="empty-cell">Chưa có hồ sơ sinh viên.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card compact-card">
            <div className="card-header">
              <h3>Lớp học phần nổi bật</h3>
              <p>Admin có thể nhìn nhanh số sinh viên đăng ký từng lớp.</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã lớp</th>
                    <th>Môn học</th>
                    <th>Sĩ số</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionsList.slice(0, 5).map((section) => (
                    <tr key={section.id}>
                      <td>{section.sectionCode}</td>
                      <td>{section.courseName}</td>
                      <td>{section.enrollmentCount}/{section.maxStudents}</td>
                      <td>
                        <span className={`pill ${section.status === 'open' ? 'success' : 'neutral'}`}>
                          {section.status === 'open' ? 'Mở đăng ký' : 'Đóng đăng ký'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sectionsList.length === 0 && (
                    <tr>
                      <td colSpan="4" className="empty-cell">Chưa có lớp học phần nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderStudentsSection() {
    return (
      <section className="dashboard-grid two-columns">
        {(isAdmin || editingStudent) && (
          <StudentForm
            currentStudent={editingStudent}
            onSubmit={handleCreateOrUpdateStudent}
            onCancel={() => setEditingStudent(null)}
            canCreate={isAdmin}
          />
        )}

        <div className="card compact-card">
          <div className="card-header">
            <h3>Quản lý hồ sơ sinh viên</h3>
            <p>Tìm kiếm nhanh theo mã sinh viên, họ tên, lớp hoặc ngành.</p>
          </div>

          <div className="toolbar">
            <input
              placeholder="Tìm kiếm sinh viên..."
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mã SV</th>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Lớp</th>
                  <th>Ngành</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td>{student.studentCode}</td>
                    <td>{student.fullName}</td>
                    <td>{student.email}</td>
                    <td>{student.className}</td>
                    <td>{student.major}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-warning" onClick={() => setEditingStudent(student)}>
                          Sửa
                        </button>
                        {isAdmin && (
                          <button className="btn btn-danger" onClick={() => handleDeleteStudent(student.id)}>
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-cell">Không tìm thấy sinh viên phù hợp.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderLecturersSection() {
    return (
      <section className="dashboard-grid two-columns">
        <LecturerForm
          currentLecturer={editingLecturer}
          onSubmit={handleCreateOrUpdateLecturer}
          onCancel={() => setEditingLecturer(null)}
        />

        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>Quản lý hồ sơ giảng viên</h3>
            <p>Admin có thể thêm, sửa, xóa giảng viên và cấp mã giảng viên riêng cho từng người.</p>
          </div>

          <div className="toolbar">
            <input
              placeholder="Tìm kiếm giảng viên..."
              value={lecturerSearch}
              onChange={(event) => setLecturerSearch(event.target.value)}
            />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mã GV</th>
                  <th>Họ tên</th>
                  <th>Tài khoản</th>
                  <th>Email</th>
                  <th>Khoa/Bộ môn</th>
                  <th>Học vị</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredLecturers.map((lecturer) => (
                  <tr key={lecturer.id}>
                    <td>{lecturer.lecturerCode}</td>
                    <td>{lecturer.fullName}</td>
                    <td>{lecturer.username || '--'}</td>
                    <td>{lecturer.email}</td>
                    <td>{lecturer.department || '--'}</td>
                    <td>{lecturer.degree || '--'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-warning" onClick={() => setEditingLecturer(lecturer)}>
                          Sửa
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDeleteLecturer(lecturer.id)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLecturers.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">Chưa có hồ sơ giảng viên nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderCoursesSection() {
    return (
      <section className="dashboard-grid two-columns">
        <CourseForm
          currentCourse={editingCourse}
          onSubmit={handleCreateOrUpdateCourse}
          onCancel={() => setEditingCourse(null)}
          defaultLecturerName={user?.fullName || ''}
          canEditLecturer={isAdmin}
        />

        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>Danh sách môn học</h3>
            <p>Giảng viên có thể nhập tên môn học trực tiếp từ bàn phím rồi dùng môn đó để tạo lớp học phần.</p>
          </div>

          <div className="toolbar">
            <input
              placeholder="Tìm kiếm môn học..."
              value={courseSearch}
              onChange={(event) => setCourseSearch(event.target.value)}
            />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mã môn</th>
                  <th>Tên môn</th>
                  <th>Tín chỉ</th>
                  <th>Giảng viên</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((course) => (
                  <tr key={course.id}>
                    <td>{course.courseCode}</td>
                    <td>{course.courseName}</td>
                    <td>{course.credits}</td>
                    <td>{course.lecturerName || '--'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-warning" onClick={() => setEditingCourse(course)}>
                          Sửa
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDeleteCourse(course.id)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCourses.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-cell">Chưa có môn học nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderGradesSection() {
    return (
      <>
        {isStudent && (
          <section className="stats-grid student-grade-grid">
            <div className="stat-card">
              <span>Điểm trung bình</span>
              <strong>{averageGrade || '--'}</strong>
              <small>Theo toàn bộ môn đã có điểm</small>
            </div>
            <div className="stat-card">
              <span>Môn đã qua</span>
              <strong>{passedGrades.length}</strong>
              <small>Các môn có tổng kết từ 4.0 trở lên</small>
            </div>
            <div className="stat-card">
              <span>Tín chỉ tích lũy</span>
              <strong>{earnedCredits}</strong>
              <small>Tổng tín chỉ các môn đã đạt</small>
            </div>
            <div className="stat-card">
              <span>Môn cao nhất</span>
              <strong>{highestGrade ? highestGrade.letterGrade : '--'}</strong>
              <small>{highestGrade ? highestGrade.courseName : 'Chưa có dữ liệu'}</small>
            </div>
          </section>
        )}

        <section className="dashboard-grid two-columns">
          {!isStudent && (
            <GradeForm
              students={students}
              courses={courses}
              currentGrade={editingGrade}
              onSubmit={handleCreateOrUpdateGrade}
              onCancel={() => setEditingGrade(null)}
            />
          )}

          <div className="card compact-card wide-card">
            <div className="card-header">
              <h3>{isStudent ? 'Bảng điểm cá nhân' : 'Bảng điểm sinh viên'}</h3>
              <p>{isStudent ? 'Xem toàn bộ điểm số của bạn.' : 'Tìm kiếm theo sinh viên, môn học hoặc học kỳ.'}</p>
            </div>

            {isStudent && (
              <div className="toolbar">
                <button className="btn btn-primary" type="button" onClick={handleExportGradesExcel}>
                  Xuất file Excel
                </button>
              </div>
            )}

            {!isStudent && (
              <div className="toolbar">
                <input
                  placeholder="Tìm kiếm bảng điểm..."
                  value={gradeSearch}
                  onChange={(event) => setGradeSearch(event.target.value)}
                />
              </div>
            )}

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    {!isStudent && <th>Sinh viên</th>}
                    <th>Môn học</th>
                    <th>Học kỳ</th>
                    <th>Giữa kỳ</th>
                    <th>Cuối kỳ</th>
                    <th>Tổng kết</th>
                    <th>Điểm chữ</th>
                    {!isStudent && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {(isStudent ? grades : filteredGrades).map((grade) => (
                    <tr key={grade.id}>
                      {!isStudent && (
                        <td>
                          <div>{grade.studentCode}</div>
                          <small>{grade.fullName}</small>
                        </td>
                      )}
                      <td>
                        <div>{grade.courseName}</div>
                        <small>{grade.courseCode}</small>
                      </td>
                      <td>{grade.semester}</td>
                      <td>{grade.midterm}</td>
                      <td>{grade.final}</td>
                      <td>{grade.total}</td>
                      <td><span className="pill success">{grade.letterGrade}</span></td>
                      {!isStudent && (
                        <td>
                          <div className="action-buttons">
                            <button className="btn btn-warning" onClick={() => setEditingGrade(grade)}>
                              Sửa
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDeleteGrade(grade.id)}>
                              Xóa
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {(isStudent ? grades : filteredGrades).length === 0 && (
                    <tr>
                      <td colSpan={isStudent ? 6 : 8} className="empty-cell">Chưa có dữ liệu điểm số.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderWeeklyScheduleSection() {
    const weeklySchedules = isStudent ? schedules : lecturerWeeklySchedules;

    return (
      <section className="dashboard-grid">
        <WeeklyTimetable
          schedules={weeklySchedules}
          title={isStudent ? 'Thời khóa biểu tuần' : 'Thời khóa biểu giảng dạy trong tuần'}
          description={
            isStudent
              ? 'Bảng tuần hiển thị tự động từ các lớp học phần bạn đã đăng ký.'
              : 'Bảng tuần hiển thị các lịch học bạn đã tạo trong hệ thống.'
          }
          emptyMessage={
            isStudent
              ? 'Bạn chưa có môn học nào trong thời khóa biểu tuần.'
              : 'Bạn chưa tạo lịch học nào để hiển thị thời khóa biểu tuần.'
          }
        />

        <div className="card compact-card">
          <div className="card-header">
            <h3>{isStudent ? 'Ghi chú thời khóa biểu' : 'Ghi chú lịch giảng dạy'}</h3>
            <p>
              {isStudent
                ? 'Dữ liệu được lấy trực tiếp từ các lớp học phần bạn đã đăng ký trong hệ thống.'
                : 'Dữ liệu được lấy trực tiếp từ các lịch học bạn đã tạo trong hệ thống.'}
            </p>
          </div>

          {isStudent ? (
            <div className="profile-grid">
              <div><strong>Tổng số buổi học:</strong> {schedules.length}</div>
              <div><strong>Số lớp học phần đã đăng ký:</strong> {registeredSections.length}</div>
              <div><strong>Môn học trong tuần:</strong> {new Set(schedules.map((item) => item.courseCode)).size}</div>
              <div><strong>Giảng viên hiển thị:</strong> {schedules.some((item) => item.lecturerName) ? 'Có' : 'Chưa có dữ liệu'}</div>
            </div>
          ) : (
            <div className="profile-grid">
              <div><strong>Tổng số buổi dạy:</strong> {lecturerWeeklySchedules.length}</div>
              <div><strong>Lịch học đã tạo:</strong> {lecturerWeeklySchedules.length}</div>
              <div><strong>Môn đang giảng dạy:</strong> {new Set(lecturerWeeklySchedules.map((item) => item.courseCode)).size}</div>
              <div><strong>Thời khóa biểu tuần:</strong> {lecturerWeeklySchedules.length ? 'Đã cập nhật' : 'Chưa có dữ liệu'}</div>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderGradeExportSection() {
    return (
      <section className="dashboard-grid two-columns">
        <div className="card compact-card">
          <div className="card-header">
            <h3>Xuất bảng điểm ra Excel</h3>
            <p>Tải bảng điểm cá nhân dưới dạng file Excel để nộp, lưu trữ hoặc in ra khi cần.</p>
          </div>

          <div className="profile-grid">
            <div><strong>Họ tên:</strong> {profile?.fullName || user?.fullName || '--'}</div>
            <div><strong>Mã sinh viên:</strong> {profile?.studentCode || user?.studentCode || '--'}</div>
            <div><strong>Số môn đã có điểm:</strong> {grades.length}</div>
            <div><strong>Điểm trung bình:</strong> {averageGrade || '--'}</div>
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button className="btn btn-primary" type="button" onClick={handleExportGradesExcel}>
              Xuất file Excel
            </button>
          </div>
        </div>

        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>Dữ liệu sẽ được xuất</h3>
            <p>File Excel bao gồm đầy đủ thông tin học phần và kết quả học tập hiện tại của bạn.</p>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mã môn</th>
                  <th>Tên môn</th>
                  <th>Tín chỉ</th>
                  <th>Giảng viên</th>
                  <th>Học kỳ</th>
                  <th>Tổng kết</th>
                  <th>Điểm chữ</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((grade) => (
                  <tr key={grade.id}>
                    <td>{grade.courseCode}</td>
                    <td>{grade.courseName}</td>
                    <td>{grade.credits || 0}</td>
                    <td>{grade.lecturerName || '--'}</td>
                    <td>{grade.semester}</td>
                    <td>{grade.total}</td>
                    <td><span className="pill success">{grade.letterGrade}</span></td>
                  </tr>
                ))}
                {grades.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">Chưa có dữ liệu điểm số để xuất.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderSchedulesSection() {
    return (
      <section className="dashboard-grid two-columns">
        {!isStudent && (
          <ScheduleForm
            courses={courses}
            currentSchedule={editingSchedule}
            onSubmit={handleCreateOrUpdateSchedule}
            onCancel={() => setEditingSchedule(null)}
          />
        )}

        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>{isStudent ? 'Lịch học cá nhân' : 'Quản lý lịch học'}</h3>
            <p>
              {isStudent
                ? 'Lịch học được cập nhật tự động từ các lớp học phần bạn đã đăng ký.'
                : 'Theo dõi và cập nhật lịch học cho từng lớp.'}
            </p>
          </div>

          {!isStudent && (
            <div className="toolbar">
              <input
                placeholder="Tìm kiếm lịch học..."
                value={scheduleSearch}
                onChange={(event) => setScheduleSearch(event.target.value)}
              />
            </div>
          )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Môn học</th>
                  <th>Giảng viên</th>
                  <th>{isStudent ? 'Lớp học phần' : 'Lớp'}</th>
                  <th>Ngày học</th>
                  <th>Thời gian</th>
                  <th>Phòng</th>
                  <th>Học kỳ</th>
                  {!isStudent && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {(isStudent ? schedules : filteredSchedules).map((schedule) => (
                  <tr key={`${schedule.id}-${schedule.courseCode}-${schedule.startTime}`}>
                    <td>
                      <div>{schedule.courseName}</div>
                      <small>{schedule.courseCode}</small>
                    </td>
                    <td>{schedule.lecturerName || '--'}</td>
                    <td>{schedule.className}</td>
                    <td>{schedule.dayOfWeek}</td>
                    <td>{schedule.startTime} - {schedule.endTime}</td>
                    <td>{schedule.room}</td>
                    <td>{schedule.semester}</td>
                    {!isStudent && (
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-warning" onClick={() => setEditingSchedule(schedule)}>
                            Sửa
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteSchedule(schedule.id)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {(isStudent ? schedules : filteredSchedules).length === 0 && (
                  <tr>
                    <td colSpan={isStudent ? 7 : 8} className="empty-cell">Chưa có lịch học.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderSectionsSection() {
    return (
      <section className="dashboard-grid two-columns">
        <SectionForm
          courses={courses}
          currentSection={editingSection}
          onSubmit={handleCreateOrUpdateSection}
          onCancel={() => setEditingSection(null)}
        />

        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>Quản lý lớp học phần</h3>
            <p>Giảng viên tạo lớp, admin theo dõi số lượng sinh viên đăng ký.</p>
          </div>

          <div className="toolbar">
            <input
              placeholder="Tìm kiếm lớp học phần..."
              value={sectionSearch}
              onChange={(event) => setSectionSearch(event.target.value)}
            />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mã lớp</th>
                  <th>Môn học</th>
                  <th>Giảng viên</th>
                  <th>Lịch</th>
                  <th>Sĩ số</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSections.map((section) => (
                  <tr key={section.id}>
                    <td>{section.sectionCode}</td>
                    <td>
                      <div>{section.courseName}</div>
                      <small>{section.courseCode} - {section.semester}</small>
                    </td>
                    <td>{section.lecturerName}</td>
                    <td>{section.dayOfWeek}, {section.startTime} - {section.endTime}</td>
                    <td>{section.enrollmentCount}/{section.maxStudents}</td>
                    <td>
                      <span className={`pill ${section.status === 'open' ? 'success' : 'neutral'}`}>
                        {section.status === 'open' ? 'Mở đăng ký' : 'Đóng đăng ký'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-warning" onClick={() => setEditingSection(section)}>
                          Sửa
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDeleteSection(section.id)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSections.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">Chưa có lớp học phần nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderRegistrationSection() {
    return (
      <section className="card compact-card wide-card">
        <div className="card-header">
          <h3>Đăng ký môn học</h3>
          <p>Sau khi đăng ký xong, lịch học sẽ tự động hiển thị ở mục Lịch học cá nhân.</p>
        </div>

        <div className="toolbar">
          <input
            placeholder="Tìm kiếm lớp học phần hoặc môn học..."
            value={sectionSearch}
            onChange={(event) => setSectionSearch(event.target.value)}
          />
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mã lớp</th>
                <th>Môn học</th>
                <th>Giảng viên</th>
                <th>Lịch học</th>
                <th>Phòng</th>
                <th>Sĩ số</th>
                <th>Trạng thái</th>
                <th>Đăng ký</th>
              </tr>
            </thead>
            <tbody>
              {filteredSections.map((section) => {
                const isRegisteredSection = Number(section.isRegistered) === 1;
                const isFull = Number(section.enrollmentCount) >= Number(section.maxStudents);
                const isClosed = section.status !== 'open';

                return (
                  <tr key={section.id}>
                    <td>{section.sectionCode}</td>
                    <td>
                      <div>{section.courseName}</div>
                      <small>{section.courseCode} - {section.semester}</small>
                    </td>
                    <td>{section.lecturerName}</td>
                    <td>{section.dayOfWeek}, {section.startTime} - {section.endTime}</td>
                    <td>{section.room}</td>
                    <td>{section.enrollmentCount}/{section.maxStudents}</td>
                    <td>
                      <span className={`pill ${isClosed ? 'neutral' : 'success'}`}>
                        {isClosed ? 'Đóng đăng ký' : 'Mở đăng ký'}
                      </span>
                    </td>
                    <td>
                      {isRegisteredSection ? (
                        <button className="btn btn-danger" onClick={() => handleUnregisterSection(section.id)}>
                          Hủy đăng ký
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={isClosed || isFull}
                          onClick={() => handleRegisterSection(section.id)}
                        >
                          {isFull ? 'Đã đầy' : 'Đăng ký'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredSections.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty-cell">Chưa có lớp học phần phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderFeedbackSection() {
    if (isStudent) {
      return (
        <section className="dashboard-grid two-columns">
          <div className="card compact-card">
            <div className="card-header">
              <h3>Gửi ý kiến tới admin</h3>
              <p>Gửi thắc mắc, kiến nghị hoặc góp ý trực tiếp cho quản trị viên.</p>
            </div>

            <form className="grid-form" onSubmit={handleSubmitFeedback}>
              <input
                placeholder="Tiêu đề ý kiến"
                value={feedbackForm.subject}
                onChange={(event) => setFeedbackForm((prev) => ({ ...prev, subject: event.target.value }))}
                required
              />
              <textarea
                rows="6"
                placeholder="Nhập nội dung chi tiết..."
                value={feedbackForm.message}
                onChange={(event) => setFeedbackForm((prev) => ({ ...prev, message: event.target.value }))}
                required
              />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Gửi ý kiến</button>
              </div>
            </form>
          </div>

          <div className="card compact-card wide-card">
            <div className="card-header">
              <h3>Lịch sử ý kiến đã gửi</h3>
              <p>Theo dõi trạng thái xử lý và phản hồi từ admin.</p>
            </div>

            <div className="toolbar">
              <input
                placeholder="Tìm kiếm ý kiến của bạn..."
                value={feedbackSearch}
                onChange={(event) => setFeedbackSearch(event.target.value)}
              />
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th>Nội dung</th>
                    <th>Trạng thái</th>
                    <th>Phản hồi admin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedbacks.map((feedback) => (
                    <tr key={feedback.id}>
                      <td>{feedback.subject}</td>
                      <td>{feedback.message}</td>
                      <td>
                        <span className={`pill ${feedback.status === 'resolved' ? 'success' : 'neutral'}`}>
                          {formatFeedbackStatus(feedback.status)}
                        </span>
                      </td>
                      <td>{feedback.adminReply || 'Chưa có phản hồi'}</td>
                    </tr>
                  ))}
                  {filteredFeedbacks.length === 0 && (
                    <tr>
                      <td colSpan="4" className="empty-cell">Bạn chưa gửi ý kiến nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="dashboard-grid two-columns">
        <div className="card compact-card wide-card">
          <div className="card-header">
            <h3>Danh sách ý kiến sinh viên</h3>
            <p>Admin có thể xem trực tiếp và phản hồi ngay trong hệ thống.</p>
          </div>

          <div className="toolbar">
            <input
              placeholder="Tìm kiếm ý kiến sinh viên..."
              value={feedbackSearch}
              onChange={(event) => setFeedbackSearch(event.target.value)}
            />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Sinh viên</th>
                  <th>Tiêu đề</th>
                  <th>Nội dung</th>
                  <th>Trạng thái</th>
                  <th>Phản hồi</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedbacks.map((feedback) => (
                  <tr key={feedback.id}>
                    <td>
                      <div>{feedback.fullName}</div>
                      <small>{feedback.studentCode} - {feedback.className}</small>
                    </td>
                    <td>{feedback.subject}</td>
                    <td>{feedback.message}</td>
                    <td>
                      <span className={`pill ${feedback.status === 'resolved' ? 'success' : 'neutral'}`}>
                        {formatFeedbackStatus(feedback.status)}
                      </span>
                    </td>
                    <td>{feedback.adminReply || 'Chưa phản hồi'}</td>
                    <td>
                      <button className="btn btn-warning" onClick={() => startReplyFeedback(feedback)}>
                        Phản hồi
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredFeedbacks.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-cell">Chưa có ý kiến nào từ sinh viên.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card compact-card">
          <div className="card-header">
            <h3>{editingFeedback ? 'Phản hồi ý kiến' : 'Chọn một ý kiến để phản hồi'}</h3>
            <p>{editingFeedback ? 'Cập nhật trạng thái và trả lời trực tiếp cho sinh viên.' : 'Nhấn nút Phản hồi ở bảng bên trái để xử lý.'}</p>
          </div>

          {editingFeedback ? (
            <form className="grid-form" onSubmit={handleReplyFeedback}>
              <input value={editingFeedback.subject} disabled />
              <select
                value={replyForm.status}
                onChange={(event) => setReplyForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="new">Mới</option>
                <option value="in_progress">Đang xử lý</option>
                <option value="resolved">Đã phản hồi</option>
              </select>
              <textarea
                rows="8"
                placeholder="Nhập phản hồi của admin..."
                value={replyForm.adminReply}
                onChange={(event) => setReplyForm((prev) => ({ ...prev, adminReply: event.target.value }))}
              />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Lưu phản hồi</button>
                <button
                  className="btn btn-light"
                  type="button"
                  onClick={() => {
                    setEditingFeedback(null);
                    setReplyForm({ adminReply: '', status: 'in_progress' });
                  }}
                >
                  Hủy
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-grid">
              <div><strong>Tổng ý kiến:</strong> {feedbacks.length}</div>
              <div><strong>Chưa xử lý:</strong> {openFeedbackCount}</div>
              <div><strong>Đã phản hồi:</strong> {feedbacks.filter((item) => item.status === 'resolved').length}</div>
              <div><strong>Đang xử lý:</strong> {feedbacks.filter((item) => item.status === 'in_progress').length}</div>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderNewsSection() {
    if (isAdmin) {
      return (
        <section className="dashboard-grid two-columns">
          <div className="card compact-card wide-card">
            <div className="card-header">
              <h3>Quản lý tin tức</h3>
              <p>Đăng thông báo nghỉ học, lịch học bù hoặc các nội dung học vụ để toàn hệ thống theo dõi.</p>
            </div>

            <div className="toolbar">
              <input
                placeholder="Tìm kiếm tin tức..."
                value={newsSearch}
                onChange={(event) => setNewsSearch(event.target.value)}
              />
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th>Phân loại</th>
                    <th>Trạng thái</th>
                    <th>Ngày đăng</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNews.map((news) => (
                    <tr key={news.id}>
                      <td>
                        <div>{news.title}</div>
                        <small>{news.summary || 'Không có mô tả ngắn.'}</small>
                      </td>
                      <td>
                        <div>{news.category || 'Thông báo'}</div>
                        {Number(news.isImportant) === 1 && <small>Tin quan trọng</small>}
                      </td>
                      <td>
                        <span className={`pill ${news.status === 'published' ? 'success' : 'neutral'}`}>
                          {news.status === 'published' ? 'Đang hiển thị' : 'Bản nháp'}
                        </span>
                      </td>
                      <td>{formatDateTime(news.createdAt)}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-warning" onClick={() => setEditingNews(news)}>
                            Sửa
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteNews(news.id)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredNews.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty-cell">Chưa có tin tức nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="card compact-card wide-card">
        <div className="card-header">
          <h3>Tin tức và thông báo</h3>
          <p>Các thông báo mới nhất từ admin như nghỉ học, lịch học bù hoặc nội dung học vụ quan trọng.</p>
        </div>

        <div className="toolbar">
          <input
            placeholder="Tìm kiếm tin tức..."
            value={newsSearch}
            onChange={(event) => setNewsSearch(event.target.value)}
          />
        </div>

        <div className="news-list">
          {filteredNews.map((news) => (
            <article className="news-card" key={news.id}>
              <div className="news-card-top">
                <div className="news-card-badges">
                  <span className={`pill ${Number(news.isImportant) === 1 ? 'danger' : 'neutral'}`}>
                    {Number(news.isImportant) === 1 ? 'Quan trọng' : (news.category || 'Thông báo')}
                  </span>
                  <span className={`pill ${news.status === 'published' ? 'success' : 'neutral'}`}>
                    {news.status === 'published' ? 'Đang hiển thị' : 'Bản nháp'}
                  </span>
                </div>
                <small>{formatDateTime(news.createdAt)}</small>
              </div>

              <h4>{news.title}</h4>
              <p className="news-summary">{news.summary || 'Không có mô tả ngắn.'}</p>
              <div className="news-content">{news.content}</div>
              <div className="news-meta">Người đăng: {news.createdByName || 'Admin hệ thống'}</div>
            </article>
          ))}

          {filteredNews.length === 0 && (
            <div className="card compact-card">
              <p className="empty-cell">Hiện chưa có tin tức nào để hiển thị.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderUsersSection() {
    return (
      <section className="card compact-card">
        <div className="card-header">
          <h3>Danh sách tài khoản hệ thống</h3>
          <p>Theo dõi tài khoản admin, giảng viên và sinh viên.</p>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Mã SV</th>
                <th>Mã GV</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.username}</td>
                  <td>{item.fullName}</td>
                  <td>{item.email}</td>
                  <td><span className="pill neutral">{formatRole(item.role)}</span></td>
                  <td>{item.studentCode || '--'}</td>
                  <td>{item.lecturerCode || '--'}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-cell">Chưa có tài khoản nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderProfileSection() {
    return (
      <section className="card profile-card">
        <div className="card-header">
          <h3>Thông tin cá nhân sinh viên</h3>
          <p>Thông tin hồ sơ cá nhân đang liên kết với tài khoản đăng nhập.</p>
        </div>

        {profile && (
          <div className="profile-grid profile-grid-large">
            <div><strong>Mã sinh viên:</strong> {profile.studentCode}</div>
            <div><strong>Họ tên:</strong> {profile.fullName}</div>
            <div><strong>Email:</strong> {profile.email}</div>
            <div><strong>Lớp:</strong> {profile.className}</div>
            <div><strong>Ngành:</strong> {profile.major}</div>
            <div><strong>Giới tính:</strong> {profile.gender}</div>
            <div><strong>Ngày sinh:</strong> {profile.dob}</div>
            <div><strong>Số điện thoại:</strong> {profile.phone || '--'}</div>
            <div><strong>Ngày tạo hồ sơ:</strong> {profile.createdAt}</div>
          </div>
        )}
      </section>
    );
  }

  function renderSectionContent() {
    if (activeSection === 'overview') return renderOverviewSection();
    if (activeSection === 'students') return renderStudentsSection();
    if (activeSection === 'lecturers') return renderLecturersSection();
    if (activeSection === 'courses') return renderCoursesSection();
    if (activeSection === 'grades') return renderGradesSection();
    if (activeSection === 'gradeExport') return renderGradeExportSection();
    if (activeSection === 'weeklySchedule') return renderWeeklyScheduleSection();
    if (activeSection === 'schedules' || activeSection === 'schedule') return renderSchedulesSection();
    if (activeSection === 'sections') return renderSectionsSection();
    if (activeSection === 'registration') return renderRegistrationSection();
    if (activeSection === 'feedback' || activeSection === 'feedbacks') return renderFeedbackSection();
    if (activeSection === 'news') return renderNewsSection();
    if (activeSection === 'users') return renderUsersSection();
    if (activeSection === 'profile') return renderProfileSection();
    return null;
  }

  if (loading) {
    return <div className="page-center">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="dashboard-shell">
      <NavBar />

      <main className="dashboard-layout">
        <RoleSidebar
          title={formatRole(user?.role)}
          subtitle={`Xin chào ${user?.fullName}`}
          items={sections}
          activeKey={activeSection}
          onChange={setActiveSection}
        />

        <section className="content-area">
          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert success">{message}</div>}

          <div className="section-heading">
            <div>
              <p className="eyebrow">Bảng điều khiển</p>
              <h2>{sections.find((item) => item.key === activeSection)?.label || 'Tổng quan'}</h2>
              <p>
                {sections.find((item) => item.key === activeSection)?.description ||
                  'Quản lý dữ liệu trong hệ thống.'}
              </p>
            </div>
          </div>

          {renderSectionContent()}
        </section>
      </main>
    </div>
  );
}
