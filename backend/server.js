const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { initDatabase, run, get, all } = require('./db');
const { createToken, authMiddleware, requireRoles } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://projectcuahoangvu-1.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const ROLE_STAFF = ['admin', 'lecturer'];
const WEEKDAY_ORDER = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];


function timeToMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function normalizeDayList(dayOfWeek, daysOfWeek) {
  const rawDays = Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek : [dayOfWeek];
  return [...new Set(rawDays.filter((day) => WEEKDAY_ORDER.includes(day)))];
}

function hasTimeOverlap(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

async function findScheduleConflict({
  semester,
  dayOfWeek,
  startTime,
  endTime,
  className,
  room,
  createdBy = null,
  excludeId = null
}) {
  const rows = await all(
    `SELECT sc.*, c.courseCode, c.courseName
     FROM schedules sc
     LEFT JOIN courses c ON c.id = sc.courseId
     WHERE sc.semester = ? AND sc.dayOfWeek = ? AND (? IS NULL OR sc.id != ?)` ,
    [semester, dayOfWeek, excludeId, excludeId]
  );

  return rows.find((row) => {
    const overlap = hasTimeOverlap(startTime, endTime, row.startTime, row.endTime);
    if (!overlap) return false;

    const sameClass = String(row.className || '').trim().toLowerCase() === String(className || '').trim().toLowerCase();
    const sameRoom = String(row.room || '').trim().toLowerCase() === String(room || '').trim().toLowerCase();
    const sameLecturer = createdBy && Number(row.createdBy) === Number(createdBy);

    if (sameClass) {
      row.conflictType = 'class';
      return true;
    }

    if (sameRoom) {
      row.conflictType = 'room';
      return true;
    }

    if (sameLecturer) {
      row.conflictType = 'lecturer';
      return true;
    }

    return false;
  }) || null;
}

function buildConflictMessage(conflictRow, dayOfWeek) {
  if (conflictRow.conflictType === 'lecturer') {
    const courseLabel = conflictRow.courseName
      ? `${conflictRow.courseName}${conflictRow.courseCode ? ` (${conflictRow.courseCode})` : ''}`
      : 'một môn học khác';
    return `Trùng lịch giảng dạy vào ${dayOfWeek} với ${courseLabel}, từ ${conflictRow.startTime} đến ${conflictRow.endTime}. Vui lòng chọn thời gian khác.`;
  }

  const conflictParts = [];
  if (conflictRow.className) conflictParts.push(`lớp ${conflictRow.className}`);
  if (conflictRow.room) conflictParts.push(`phòng ${conflictRow.room}`);
  const detail = conflictParts.length ? ` (${conflictParts.join(', ')})` : '';
  return `Trùng giờ học vào ${dayOfWeek}${detail}. Vui lòng chọn thời gian khác.`;
}

async function getCurrentLecturerName(req, fallbackLecturerName = '') {
  if (req.user?.role !== 'lecturer') {
    return fallbackLecturerName || '';
  }

  if (req.user?.fullName) {
    return req.user.fullName;
  }

  const currentUser = await get('SELECT fullName FROM users WHERE id = ?', [req.user.id]);
  return currentUser?.fullName || fallbackLecturerName || '';
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function getLetterGrade(total) {
  const score = Number(total || 0);
  if (score >= 8.5) return 'A';
  if (score >= 8.0) return 'B+';
  if (score >= 7.0) return 'B';
  if (score >= 6.5) return 'C+';
  if (score >= 5.5) return 'C';
  if (score >= 5.0) return 'D+';
  if (score >= 4.0) return 'D';
  return 'F';
}

function calculateTotal(midterm, final) {
  return roundScore(Number(midterm || 0) * 0.4 + Number(final || 0) * 0.6);
}

async function getCurrentStudentByUserId(userId) {
  return get('SELECT * FROM students WHERE userId = ?', [userId]);
}

async function getCurrentLecturerByUserId(userId) {
  return get('SELECT * FROM lecturers WHERE userId = ?', [userId]);
}

async function generateNextLecturerCode() {
  const rows = await all('SELECT lecturerCode FROM lecturers WHERE lecturerCode IS NOT NULL');
  let maxCodeNumber = 0;

  rows.forEach((row) => {
    const match = String(row.lecturerCode || '').match(/(\d+)$/);
    if (match) {
      maxCodeNumber = Math.max(maxCodeNumber, Number(match[1]));
    }
  });

  return `GV${String(maxCodeNumber + 1).padStart(3, '0')}`;
}

async function getCurrentSectionWithCount(sectionId) {
  return get(
    `SELECT se.*, c.courseCode, c.courseName, c.credits, u.fullName AS lecturerName,
            COUNT(e.id) AS enrollmentCount
     FROM sections se
     JOIN courses c ON c.id = se.courseId
     JOIN users u ON u.id = se.lecturerId
     LEFT JOIN enrollments e ON e.sectionId = se.id
     WHERE se.id = ?
     GROUP BY se.id`,
    [sectionId]
  );
}

app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend đang chạy tốt.' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      username,
      password,
      role,
      fullName,
      email,
      studentCode,
      lecturerCode,
      className,
      major,
      department,
      degree,
      gender,
      dob,
      phone
    } = req.body;

    if (!username || !password || !role || !fullName || !email) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin bắt buộc.' });
    }

    if (!['lecturer', 'student'].includes(role)) {
      return res.status(400).json({ message: 'Chỉ được đăng ký tài khoản lecturer hoặc student.' });
    }

    if (role === 'student' && !studentCode) {
      return res.status(400).json({ message: 'Sinh viên phải có mã sinh viên.' });
    }

    const existedUser = await get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existedUser) {
      return res.status(400).json({ message: 'Username hoặc email đã tồn tại.' });
    }

    let finalLecturerCode = null;

    if (role === 'student') {
      const existedStudent = await get(
        'SELECT id FROM students WHERE studentCode = ? OR email = ?',
        [studentCode, email]
      );

      if (existedStudent) {
        return res.status(400).json({ message: 'Mã sinh viên hoặc email sinh viên đã tồn tại.' });
      }
    }

    if (role === 'lecturer') {
      finalLecturerCode = String(lecturerCode || '').trim() || await generateNextLecturerCode();

      const existedLecturer = await get(
        'SELECT id FROM lecturers WHERE lecturerCode = ? OR email = ?',
        [finalLecturerCode, email]
      );
      const existedLecturerUser = await get(
        'SELECT id FROM users WHERE lecturerCode = ?',
        [finalLecturerCode]
      );

      if (existedLecturer || existedLecturerUser) {
        return res.status(400).json({ message: 'Mã giảng viên hoặc email giảng viên đã tồn tại.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await run(
      `INSERT INTO users (username, password, role, fullName, email, studentCode, lecturerCode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, role, fullName, email, role === 'student' ? studentCode : null, role === 'lecturer' ? finalLecturerCode : null]
    );

    if (role === 'student') {
      await run(
        `INSERT INTO students (studentCode, fullName, email, className, major, gender, dob, phone, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentCode,
          fullName,
          email,
          className || '',
          major || '',
          gender || '',
          dob || '',
          phone || '',
          createdUser.id
        ]
      );
    }

    if (role === 'lecturer') {
      await run(
        `INSERT INTO lecturers (lecturerCode, fullName, email, department, degree, gender, dob, phone, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalLecturerCode,
          fullName,
          email,
          department || '',
          degree || '',
          gender || '',
          dob || '',
          phone || '',
          createdUser.id
        ]
      );
    }

    return res.status(201).json({ message: 'Đăng ký tài khoản thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi đăng ký.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập username và password.' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(400).json({ message: 'Tài khoản không tồn tại.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Sai mật khẩu.' });
    }

    const token = createToken(user);

    return res.json({
      message: 'Đăng nhập thành công.',
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        studentCode: user.studentCode,
        lecturerCode: user.lecturerCode
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi đăng nhập.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, fullName, email, role, studentCode, lecturerCode, createdAt FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    return res.json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy thông tin người dùng.' });
  }
});


app.get('/api/news', authMiddleware, async (req, res) => {
  try {
    const query = req.user?.role === 'admin'
      ? `SELECT n.*, u.fullName AS createdByName
         FROM news n
         LEFT JOIN users u ON u.id = n.createdBy
         ORDER BY n.isImportant DESC, n.createdAt DESC`
      : `SELECT n.*, u.fullName AS createdByName
         FROM news n
         LEFT JOIN users u ON u.id = n.createdBy
         WHERE n.status = 'published'
         ORDER BY n.isImportant DESC, n.createdAt DESC`;

    const news = await all(query);
    return res.json(news);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách tin tức.' });
  }
});

app.get('/api/users', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const users = await all(`
      SELECT
        id,
        username,
        fullName,
        email,
        role,
        studentCode,
        lecturerCode,
        createdAt
      FROM users
      ORDER BY id DESC
    `);

    res.json(users);
  } catch (error) {
    console.error('GET /api/users error:', error);

    res.status(500).json({
      message: 'Không thể lấy danh sách người dùng.'
    });
  }
});

app.post('/api/news', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { title, summary, content, category, status, isImportant } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề và nội dung tin tức.' });
    }

    const result = await run(
      `INSERT INTO news (title, summary, content, category, status, isImportant, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        summary || '',
        content.trim(),
        category || 'Thông báo',
        status === 'draft' ? 'draft' : 'published',
        Number(isImportant) ? 1 : 0,
        req.user.id
      ]
    );

    const newsItem = await get(
      `SELECT n.*, u.fullName AS createdByName
       FROM news n
       LEFT JOIN users u ON u.id = n.createdBy
       WHERE n.id = ?`,
      [result.id]
    );

    return res.status(201).json({ message: 'Đăng tin tức thành công.', news: newsItem });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi đăng tin tức.' });
  }
});

app.put('/api/news/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, summary, content, category, status, isImportant } = req.body;

    const current = await get('SELECT * FROM news WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy tin tức.' });
    }

    if (!title || !content) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề và nội dung tin tức.' });
    }

    await run(
      `UPDATE news
       SET title = ?, summary = ?, content = ?, category = ?, status = ?, isImportant = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title.trim(),
        summary || '',
        content.trim(),
        category || 'Thông báo',
        status === 'draft' ? 'draft' : 'published',
        Number(isImportant) ? 1 : 0,
        id
      ]
    );

    const newsItem = await get(
      `SELECT n.*, u.fullName AS createdByName
       FROM news n
       LEFT JOIN users u ON u.id = n.createdBy
       WHERE n.id = ?`,
      [id]
    );

    return res.json({ message: 'Cập nhật tin tức thành công.', news: newsItem });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật tin tức.' });
  }
});

app.delete('/api/news/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT id FROM news WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy tin tức.' });
    }

    await run('DELETE FROM news WHERE id = ?', [id]);
    return res.json({ message: 'Xóa tin tức thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa tin tức.' });
  }
});


app.get('/api/lecturers', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const lecturers = await all(
      `SELECT l.*, u.username
       FROM lecturers l
       LEFT JOIN users u ON u.id = l.userId
       ORDER BY l.id DESC`
    );
    return res.json(lecturers);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách giảng viên.' });
  }
});

app.post('/api/lecturers', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const {
      lecturerCode,
      fullName,
      email,
      username,
      password,
      department,
      degree,
      gender,
      dob,
      phone
    } = req.body;

    if (!lecturerCode || !fullName || !email || !username || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập mã giảng viên, họ tên, email, username và password.' });
    }

    const duplicateLecturer = await get(
      'SELECT id FROM lecturers WHERE lecturerCode = ? OR email = ?',
      [lecturerCode, email]
    );
    if (duplicateLecturer) {
      return res.status(400).json({ message: 'Mã giảng viên hoặc email đã tồn tại.' });
    }

    const duplicateUser = await get(
      'SELECT id FROM users WHERE username = ? OR email = ? OR lecturerCode = ?',
      [username, email, lecturerCode]
    );
    if (duplicateUser) {
      return res.status(400).json({ message: 'Username, email hoặc mã giảng viên đã tồn tại.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const createdUser = await run(
      `INSERT INTO users (username, password, role, fullName, email, lecturerCode)
       VALUES (?, ?, 'lecturer', ?, ?, ?)`,
      [username.trim(), hashedPassword, fullName.trim(), email.trim(), lecturerCode.trim()]
    );

    const result = await run(
      `INSERT INTO lecturers (lecturerCode, fullName, email, department, degree, gender, dob, phone, userId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lecturerCode.trim(),
        fullName.trim(),
        email.trim(),
        department || '',
        degree || '',
        gender || '',
        dob || '',
        phone || '',
        createdUser.id
      ]
    );

    const lecturer = await get(
      `SELECT l.*, u.username
       FROM lecturers l
       LEFT JOIN users u ON u.id = l.userId
       WHERE l.id = ?`,
      [result.id]
    );

    return res.status(201).json({ message: 'Thêm giảng viên thành công.', lecturer });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi thêm giảng viên.' });
  }
});

app.put('/api/lecturers/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      lecturerCode,
      fullName,
      email,
      username,
      password,
      department,
      degree,
      gender,
      dob,
      phone
    } = req.body;

    if (!lecturerCode || !fullName || !email || !username) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ mã giảng viên, họ tên, email và username.' });
    }

    const current = await get('SELECT * FROM lecturers WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy giảng viên.' });
    }

    const duplicateLecturer = await get(
      'SELECT id FROM lecturers WHERE (lecturerCode = ? OR email = ?) AND id != ?',
      [lecturerCode, email, id]
    );
    if (duplicateLecturer) {
      return res.status(400).json({ message: 'Mã giảng viên hoặc email bị trùng với giảng viên khác.' });
    }

    const duplicateUser = await get(
      'SELECT id FROM users WHERE (username = ? OR email = ? OR lecturerCode = ?) AND id != ?',
      [username, email, lecturerCode, current.userId]
    );
    if (duplicateUser) {
      return res.status(400).json({ message: 'Username, email hoặc mã giảng viên đã tồn tại.' });
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await run(
        `UPDATE users
         SET username = ?, password = ?, fullName = ?, email = ?, lecturerCode = ?
         WHERE id = ?`,
        [username.trim(), hashedPassword, fullName.trim(), email.trim(), lecturerCode.trim(), current.userId]
      );
    } else {
      await run(
        `UPDATE users
         SET username = ?, fullName = ?, email = ?, lecturerCode = ?
         WHERE id = ?`,
        [username.trim(), fullName.trim(), email.trim(), lecturerCode.trim(), current.userId]
      );
    }

    await run(
      `UPDATE lecturers
       SET lecturerCode = ?, fullName = ?, email = ?, department = ?, degree = ?, gender = ?, dob = ?, phone = ?
       WHERE id = ?`,
      [
        lecturerCode.trim(),
        fullName.trim(),
        email.trim(),
        department || '',
        degree || '',
        gender || '',
        dob || '',
        phone || '',
        id
      ]
    );

    if (current.fullName !== fullName.trim()) {
      await run('UPDATE courses SET lecturerName = ? WHERE lecturerName = ?', [fullName.trim(), current.fullName]);
    }

    const lecturer = await get(
      `SELECT l.*, u.username
       FROM lecturers l
       LEFT JOIN users u ON u.id = l.userId
       WHERE l.id = ?`,
      [id]
    );

    return res.json({ message: 'Cập nhật giảng viên thành công.', lecturer });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật giảng viên.' });
  }
});

app.delete('/api/lecturers/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT * FROM lecturers WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy giảng viên.' });
    }

    const relatedSection = await get('SELECT id FROM sections WHERE lecturerId = ? LIMIT 1', [current.userId]);
    const relatedSchedule = await get('SELECT id FROM schedules WHERE createdBy = ? LIMIT 1', [current.userId]);
    if (relatedSection || relatedSchedule) {
      return res.status(400).json({ message: 'Không thể xóa giảng viên đã có lịch học hoặc lớp học phần phụ trách.' });
    }

    await run('UPDATE courses SET lecturerName = ? WHERE lecturerName = ?', ['', current.fullName]);
    await run('DELETE FROM lecturers WHERE id = ?', [id]);
    await run('DELETE FROM users WHERE id = ?', [current.userId]);
    return res.json({ message: 'Xóa giảng viên thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa giảng viên.' });
  }
});

app.get('/api/stats', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const [
      totalStudents,
      totalUsers,
      totalLecturers,
      totalCourses,
      totalGrades,
      totalSchedules,
      totalSections,
      totalEnrollments,
      totalFeedbacks,
      openFeedbacks,
      totalNews,
      averageGrade
    ] = await Promise.all([
      get('SELECT COUNT(*) as count FROM students'),
      get('SELECT COUNT(*) as count FROM users'),
      get("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'"),
      get('SELECT COUNT(*) as count FROM courses'),
      get('SELECT COUNT(*) as count FROM grades'),
      get('SELECT COUNT(*) as count FROM schedules'),
      get('SELECT COUNT(*) as count FROM sections'),
      get('SELECT COUNT(*) as count FROM enrollments'),
      get('SELECT COUNT(*) as count FROM feedbacks'),
      get("SELECT COUNT(*) as count FROM feedbacks WHERE status != 'resolved'"),
      get("SELECT COUNT(*) as count FROM news WHERE status = 'published'"),
      get('SELECT ROUND(AVG(total), 1) as avg FROM grades')
    ]);

    return res.json({
      totalStudents: totalStudents.count,
      totalUsers: totalUsers.count,
      totalLecturers: totalLecturers.count,
      totalCourses: totalCourses.count,
      totalGrades: totalGrades.count,
      totalSchedules: totalSchedules.count,
      totalSections: totalSections.count,
      totalEnrollments: totalEnrollments.count,
      totalFeedbacks: totalFeedbacks.count,
      openFeedbacks: openFeedbacks.count,
      totalNews: totalNews.count,
      averageGrade: averageGrade.avg || 0
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy thống kê.' });
  }
});

app.get('/api/courses', authMiddleware, async (req, res) => {
  try {
    const courses = await all('SELECT * FROM courses ORDER BY courseCode ASC');
    return res.json(courses);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách môn học.' });
  }
});

app.post('/api/courses', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { courseCode, courseName, credits, lecturerName } = req.body;

    if (!courseCode || !courseName) {
      return res.status(400).json({ message: 'Vui lòng nhập mã môn và tên môn học.' });
    }

    const existed = await get('SELECT id FROM courses WHERE courseCode = ?', [courseCode]);
    if (existed) {
      return res.status(400).json({ message: 'Mã môn học đã tồn tại.' });
    }

    const normalizedLecturerName = await getCurrentLecturerName(req, lecturerName);

    const result = await run(
      `INSERT INTO courses (courseCode, courseName, credits, lecturerName)
       VALUES (?, ?, ?, ?)`,
      [courseCode.trim(), courseName.trim(), Number(credits || 3), normalizedLecturerName]
    );

    const course = await get('SELECT * FROM courses WHERE id = ?', [result.id]);
    return res.status(201).json({ message: 'Tạo môn học thành công.', course });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi tạo môn học.' });
  }
});

app.put('/api/courses/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const { courseCode, courseName, credits, lecturerName } = req.body;

    if (!courseCode || !courseName) {
      return res.status(400).json({ message: 'Vui lòng nhập mã môn và tên môn học.' });
    }

    const current = await get('SELECT * FROM courses WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy môn học.' });
    }

    const duplicate = await get('SELECT id FROM courses WHERE courseCode = ? AND id != ?', [courseCode, id]);
    if (duplicate) {
      return res.status(400).json({ message: 'Mã môn học đã tồn tại ở môn khác.' });
    }

    const normalizedLecturerName = await getCurrentLecturerName(req, lecturerName);

    await run(
      `UPDATE courses
       SET courseCode = ?, courseName = ?, credits = ?, lecturerName = ?
       WHERE id = ?`,
      [courseCode.trim(), courseName.trim(), Number(credits || 3), normalizedLecturerName, id]
    );

    const updatedCourse = await get('SELECT * FROM courses WHERE id = ?', [id]);
    return res.json({ message: 'Cập nhật môn học thành công.', course: updatedCourse });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật môn học.' });
  }
});

app.delete('/api/courses/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT * FROM courses WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy môn học.' });
    }

    const relatedSection = await get('SELECT id FROM sections WHERE courseId = ? LIMIT 1', [id]);
    const relatedGrade = await get('SELECT id FROM grades WHERE courseId = ? LIMIT 1', [id]);

    if (relatedSection || relatedGrade) {
      return res.status(400).json({ message: 'Không thể xóa môn học đã có lớp học phần hoặc điểm số.' });
    }

    await run('DELETE FROM courses WHERE id = ?', [id]);
    return res.json({ message: 'Xóa môn học thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa môn học.' });
  }
});

app.get('/api/students', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const students = await all('SELECT * FROM students ORDER BY id DESC');
    return res.json(students);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách sinh viên.' });
  }
});

app.get('/api/students/me', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const student = await getCurrentStudentByUserId(req.user.id);

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ sinh viên.' });
    }

    return res.json(student);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy hồ sơ sinh viên.' });
  }
});

app.post('/api/students', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { studentCode, fullName, email, className, major, gender, dob, phone } = req.body;

    if (!studentCode || !fullName || !email) {
      return res.status(400).json({ message: 'Vui lòng nhập mã sinh viên, họ tên và email.' });
    }

    const existed = await get(
      'SELECT id FROM students WHERE studentCode = ? OR email = ?',
      [studentCode, email]
    );

    if (existed) {
      return res.status(400).json({ message: 'Mã sinh viên hoặc email đã tồn tại.' });
    }

    const result = await run(
      `INSERT INTO students (studentCode, fullName, email, className, major, gender, dob, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentCode, fullName, email, className || '', major || '', gender || '', dob || '', phone || '']
    );

    const newStudent = await get('SELECT * FROM students WHERE id = ?', [result.id]);
    return res.status(201).json({ message: 'Thêm sinh viên thành công.', student: newStudent });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi thêm sinh viên.' });
  }
});

app.put('/api/students/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const { studentCode, fullName, email, className, major, gender, dob, phone } = req.body;

    const currentStudent = await get('SELECT * FROM students WHERE id = ?', [id]);
    if (!currentStudent) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const duplicate = await get(
      'SELECT id FROM students WHERE (studentCode = ? OR email = ?) AND id != ?',
      [studentCode, email, id]
    );

    if (duplicate) {
      return res.status(400).json({ message: 'Mã sinh viên hoặc email đã tồn tại ở sinh viên khác.' });
    }

    await run(
      `UPDATE students
       SET studentCode = ?, fullName = ?, email = ?, className = ?, major = ?, gender = ?, dob = ?, phone = ?
       WHERE id = ?`,
      [studentCode, fullName, email, className || '', major || '', gender || '', dob || '', phone || '', id]
    );

    if (currentStudent.userId) {
      await run(
        `UPDATE users
         SET fullName = ?, email = ?, studentCode = ?
         WHERE id = ?`,
        [fullName, email, studentCode, currentStudent.userId]
      );
    }

    const updatedStudent = await get('SELECT * FROM students WHERE id = ?', [id]);
    return res.json({ message: 'Cập nhật sinh viên thành công.', student: updatedStudent });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật sinh viên.' });
  }
});

app.delete('/api/students/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const student = await get('SELECT * FROM students WHERE id = ?', [id]);

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    if (student.userId) {
      await run('DELETE FROM users WHERE id = ?', [student.userId]);
    }

    await run('DELETE FROM students WHERE id = ?', [id]);
    return res.json({ message: 'Xóa sinh viên thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa sinh viên.' });
  }
});

app.get('/api/grades', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const grades = await all(
      `SELECT g.*, s.studentCode, s.fullName, s.className,
              c.courseCode, c.courseName, c.credits, c.lecturerName
       FROM grades g
       JOIN students s ON s.id = g.studentId
       JOIN courses c ON c.id = g.courseId
       ORDER BY g.semester DESC, s.studentCode ASC, c.courseCode ASC`
    );

    return res.json(grades);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy bảng điểm.' });
  }
});

app.get('/api/grades/me', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const grades = await all(
      `SELECT g.*, c.courseCode, c.courseName, c.credits, c.lecturerName
       FROM grades g
       JOIN courses c ON c.id = g.courseId
       WHERE g.studentId = ?
       ORDER BY g.semester DESC, c.courseCode ASC`,
      [student.id]
    );

    return res.json(grades);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy điểm của sinh viên.' });
  }
});

app.post('/api/grades', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { studentId, courseId, semester, midterm, final, notes } = req.body;

    if (!studentId || !courseId || !semester) {
      return res.status(400).json({ message: 'Vui lòng chọn sinh viên, môn học và học kỳ.' });
    }

    const duplicate = await get(
      'SELECT id FROM grades WHERE studentId = ? AND courseId = ? AND semester = ?',
      [studentId, courseId, semester]
    );

    if (duplicate) {
      return res.status(400).json({ message: 'Điểm của sinh viên cho môn học này trong học kỳ đã tồn tại.' });
    }

    const total = calculateTotal(midterm, final);
    const letterGrade = getLetterGrade(total);

    const result = await run(
      `INSERT INTO grades (studentId, courseId, semester, midterm, final, total, letterGrade, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, courseId, semester, roundScore(midterm), roundScore(final), total, letterGrade, notes || '']
    );

    const created = await get('SELECT * FROM grades WHERE id = ?', [result.id]);
    return res.status(201).json({ message: 'Nhập điểm thành công.', grade: created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi nhập điểm.' });
  }
});

app.put('/api/grades/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, courseId, semester, midterm, final, notes } = req.body;

    const current = await get('SELECT * FROM grades WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm.' });
    }

    const duplicate = await get(
      'SELECT id FROM grades WHERE studentId = ? AND courseId = ? AND semester = ? AND id != ?',
      [studentId, courseId, semester, id]
    );

    if (duplicate) {
      return res.status(400).json({ message: 'Bản ghi điểm bị trùng với dữ liệu đã có.' });
    }

    const total = calculateTotal(midterm, final);
    const letterGrade = getLetterGrade(total);

    await run(
      `UPDATE grades
       SET studentId = ?, courseId = ?, semester = ?, midterm = ?, final = ?, total = ?, letterGrade = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [studentId, courseId, semester, roundScore(midterm), roundScore(final), total, letterGrade, notes || '', id]
    );

    const updated = await get('SELECT * FROM grades WHERE id = ?', [id]);
    return res.json({ message: 'Cập nhật điểm thành công.', grade: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật điểm.' });
  }
});

app.delete('/api/grades/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT id FROM grades WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm.' });
    }

    await run('DELETE FROM grades WHERE id = ?', [id]);
    return res.json({ message: 'Xóa điểm thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa điểm.' });
  }
});

app.get('/api/schedules', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const schedules = await all(
      `SELECT sc.*, c.courseCode, c.courseName, c.credits, c.lecturerName
       FROM schedules sc
       JOIN courses c ON c.id = sc.courseId
       ORDER BY sc.semester DESC, CASE sc.dayOfWeek
         WHEN 'Thứ 2' THEN 1
         WHEN 'Thứ 3' THEN 2
         WHEN 'Thứ 4' THEN 3
         WHEN 'Thứ 5' THEN 4
         WHEN 'Thứ 6' THEN 5
         WHEN 'Thứ 7' THEN 6
         ELSE 7
       END, sc.startTime ASC`
    );

    return res.json(schedules);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy lịch học.' });
  }
});

app.get('/api/schedules/me', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const schedules = await all(
      `SELECT se.id, se.courseId, se.sectionCode AS className, se.room, se.dayOfWeek, se.startTime, se.endTime, se.semester,
              c.courseCode, c.courseName, c.credits, u.fullName AS lecturerName
       FROM enrollments en
       JOIN sections se ON se.id = en.sectionId
       JOIN courses c ON c.id = se.courseId
       JOIN users u ON u.id = se.lecturerId
       WHERE en.studentId = ?
       ORDER BY se.semester DESC, CASE se.dayOfWeek
         WHEN 'Thứ 2' THEN 1
         WHEN 'Thứ 3' THEN 2
         WHEN 'Thứ 4' THEN 3
         WHEN 'Thứ 5' THEN 4
         WHEN 'Thứ 6' THEN 5
         WHEN 'Thứ 7' THEN 6
         ELSE 7
       END, se.startTime ASC`,
      [student.id]
    );

    return res.json(schedules);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy lịch học cá nhân.' });
  }
});

app.post('/api/schedules', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { courseId, className, room, dayOfWeek, daysOfWeek, startTime, endTime, semester } = req.body;

    if (!courseId || !className || !room || (!dayOfWeek && !(Array.isArray(daysOfWeek) && daysOfWeek.length)) || !startTime || !endTime || !semester) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin lịch học.' });
    }

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return res.status(400).json({ message: 'Giờ kết thúc phải lớn hơn giờ bắt đầu.' });
    }

    const validDays = normalizeDayList(dayOfWeek, daysOfWeek);
    if (!validDays.length) {
      return res.status(400).json({ message: 'Ngày học không hợp lệ.' });
    }

    for (const day of validDays) {
      const conflict = await findScheduleConflict({
        semester,
        dayOfWeek: day,
        startTime,
        endTime,
        className,
        room,
        createdBy: req.user.id
      });

      if (conflict) {
        return res.status(400).json({ message: buildConflictMessage(conflict, day) });
      }
    }

    const createdSchedules = [];
    for (const day of validDays) {
      const result = await run(
        `INSERT INTO schedules (courseId, className, room, dayOfWeek, startTime, endTime, semester, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, className, room, day, startTime, endTime, semester, req.user.id]
      );

      const created = await get(
        `SELECT sc.*, c.courseCode, c.courseName, c.credits, c.lecturerName
         FROM schedules sc
         JOIN courses c ON c.id = sc.courseId
         WHERE sc.id = ?`,
        [result.id]
      );
      createdSchedules.push(created);
    }

    const dayLabel = createdSchedules.length > 1 ? `${createdSchedules.length} ngày trong tuần` : validDays[0];
    return res.status(201).json({
      message: `Tạo lịch học thành công cho ${dayLabel}.`,
      schedules: createdSchedules,
      schedule: createdSchedules[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi tạo lịch học.' });
  }
});

app.put('/api/schedules/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const { courseId, className, room, dayOfWeek, startTime, endTime, semester } = req.body;

    const current = await get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lịch học.' });
    }

    if (!WEEKDAY_ORDER.includes(dayOfWeek)) {
      return res.status(400).json({ message: 'Ngày học không hợp lệ.' });
    }

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return res.status(400).json({ message: 'Giờ kết thúc phải lớn hơn giờ bắt đầu.' });
    }

    const conflict = await findScheduleConflict({
      semester,
      dayOfWeek,
      startTime,
      endTime,
      className,
      room,
      createdBy: current.createdBy || req.user.id,
      excludeId: id
    });

    if (conflict) {
      return res.status(400).json({ message: buildConflictMessage(conflict, dayOfWeek) });
    }

    await run(
      `UPDATE schedules
       SET courseId = ?, className = ?, room = ?, dayOfWeek = ?, startTime = ?, endTime = ?, semester = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [courseId, className, room, dayOfWeek, startTime, endTime, semester, id]
    );

    const updated = await get(
      `SELECT sc.*, c.courseCode, c.courseName, c.credits, c.lecturerName
       FROM schedules sc
       JOIN courses c ON c.id = sc.courseId
       WHERE sc.id = ?`,
      [id]
    );
    return res.json({ message: 'Cập nhật lịch học thành công.', schedule: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật lịch học.' });
  }
});

app.delete('/api/schedules/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT id FROM schedules WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lịch học.' });
    }

    await run('DELETE FROM schedules WHERE id = ?', [id]);
    return res.json({ message: 'Xóa lịch học thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa lịch học.' });
  }
});

app.get('/api/sections/:id/students', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const section = await get('SELECT id, sectionCode FROM sections WHERE id = ?', [req.params.id]);
    if (!section) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học phần.' });
    }

    if (req.user.role === 'lecturer') {
      const ownedSection = await get(
        'SELECT id FROM sections WHERE id = ? AND lecturerId = ?',
        [req.params.id, req.user.id]
      );
      if (!ownedSection) {
        return res.status(403).json({ message: 'Bạn chỉ được xem sinh viên trong lớp học phần do mình tạo.' });
      }
    }

    const students = await all(
      `SELECT s.id, s.studentCode, s.fullName, s.email, e.createdAt AS enrolledAt
       FROM enrollments e
       JOIN students s ON s.id = e.studentId
       WHERE e.sectionId = ?
       ORDER BY s.studentCode ASC, s.fullName ASC`,
      [req.params.id]
    );

    return res.json({ section, students, enrollmentCount: students.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách sinh viên lớp học phần.' });
  }
});

app.get('/api/sections/stats', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const stats = await all(
      `SELECT se.id, se.sectionCode, se.semester, se.maxStudents, se.status,
              c.courseCode, c.courseName,
              u.fullName AS lecturerName,
              COUNT(e.id) AS enrollmentCount
       FROM sections se
       JOIN courses c ON c.id = se.courseId
       JOIN users u ON u.id = se.lecturerId
       LEFT JOIN enrollments e ON e.sectionId = se.id
       GROUP BY se.id
       ORDER BY se.semester DESC, c.courseCode ASC, se.sectionCode ASC`
    );

    return res.json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy thống kê đăng ký môn.' });
  }
});

app.get('/api/sections', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const student = await getCurrentStudentByUserId(req.user.id);
      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
      }

      const sections = await all(
        `SELECT se.*, c.courseCode, c.courseName, c.credits,
                u.fullName AS lecturerName,
                COUNT(e.id) AS enrollmentCount,
                CASE WHEN EXISTS (
                  SELECT 1 FROM enrollments en WHERE en.sectionId = se.id AND en.studentId = ?
                ) THEN 1 ELSE 0 END AS isRegistered
         FROM sections se
         JOIN courses c ON c.id = se.courseId
         JOIN users u ON u.id = se.lecturerId
         LEFT JOIN enrollments e ON e.sectionId = se.id
         GROUP BY se.id
         ORDER BY se.semester DESC, c.courseCode ASC, se.sectionCode ASC`,
        [student.id]
      );

      return res.json(sections);
    }

    const params = [];
    let where = '';
    if (req.user.role === 'lecturer') {
      where = 'WHERE se.lecturerId = ?';
      params.push(req.user.id);
    }

    const sections = await all(
      `SELECT se.*, c.courseCode, c.courseName, c.credits,
              u.fullName AS lecturerName,
              COUNT(e.id) AS enrollmentCount
       FROM sections se
       JOIN courses c ON c.id = se.courseId
       JOIN users u ON u.id = se.lecturerId
       LEFT JOIN enrollments e ON e.sectionId = se.id
       ${where}
       GROUP BY se.id
       ORDER BY se.semester DESC, c.courseCode ASC, se.sectionCode ASC`,
      params
    );

    return res.json(sections);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách lớp học phần.' });
  }
});

app.get('/api/sections/my', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const sections = await all(
      `SELECT se.*, c.courseCode, c.courseName, c.credits,
              u.fullName AS lecturerName, en.createdAt AS enrolledAt
       FROM enrollments en
       JOIN sections se ON se.id = en.sectionId
       JOIN courses c ON c.id = se.courseId
       JOIN users u ON u.id = se.lecturerId
       WHERE en.studentId = ?
       ORDER BY se.semester DESC, c.courseCode ASC, se.sectionCode ASC`,
      [student.id]
    );

    return res.json(sections);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy lớp học phần đã đăng ký.' });
  }
});

app.post('/api/sections', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { courseId, sectionCode, room, dayOfWeek, startTime, endTime, semester, maxStudents, status } = req.body;

    if (!courseId || !sectionCode || !room || !dayOfWeek || !startTime || !endTime || !semester) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin lớp học phần.' });
    }

    const existed = await get('SELECT id FROM sections WHERE sectionCode = ?', [sectionCode]);
    if (existed) {
      return res.status(400).json({ message: 'Mã lớp học phần đã tồn tại.' });
    }

    const result = await run(
      `INSERT INTO sections (courseId, sectionCode, lecturerId, room, dayOfWeek, startTime, endTime, semester, maxStudents, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [courseId, sectionCode, req.user.id, room, dayOfWeek, startTime, endTime, semester, Number(maxStudents || 50), status || 'open']
    );

    const section = await getCurrentSectionWithCount(result.id);
    return res.status(201).json({ message: 'Tạo lớp học phần thành công.', section });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi tạo lớp học phần.' });
  }
});

app.put('/api/sections/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const { courseId, sectionCode, room, dayOfWeek, startTime, endTime, semester, maxStudents, status } = req.body;

    const current = await get('SELECT * FROM sections WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học phần.' });
    }

    if (req.user.role === 'lecturer' && Number(current.lecturerId) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Bạn chỉ được sửa lớp học phần do mình tạo.' });
    }

    const duplicate = await get('SELECT id FROM sections WHERE sectionCode = ? AND id != ?', [sectionCode, id]);
    if (duplicate) {
      return res.status(400).json({ message: 'Mã lớp học phần đã tồn tại.' });
    }

    await run(
      `UPDATE sections
       SET courseId = ?, sectionCode = ?, room = ?, dayOfWeek = ?, startTime = ?, endTime = ?, semester = ?, maxStudents = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [courseId, sectionCode, room, dayOfWeek, startTime, endTime, semester, Number(maxStudents || 50), status || 'open', id]
    );

    const section = await getCurrentSectionWithCount(id);
    return res.json({ message: 'Cập nhật lớp học phần thành công.', section });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật lớp học phần.' });
  }
});

app.delete('/api/sections/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT * FROM sections WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học phần.' });
    }

    if (req.user.role === 'lecturer' && Number(current.lecturerId) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Bạn chỉ được xóa lớp học phần do mình tạo.' });
    }

    await run('DELETE FROM sections WHERE id = ?', [id]);
    return res.json({ message: 'Xóa lớp học phần thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi xóa lớp học phần.' });
  }
});

app.post('/api/sections/:id/register', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const section = await getCurrentSectionWithCount(id);
    if (!section) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học phần.' });
    }

    if (section.status !== 'open') {
      return res.status(400).json({ message: 'Lớp học phần đã đóng đăng ký.' });
    }

    const existed = await get('SELECT id FROM enrollments WHERE sectionId = ? AND studentId = ?', [id, student.id]);
    if (existed) {
      return res.status(400).json({ message: 'Bạn đã đăng ký lớp học phần này rồi.' });
    }

    if (Number(section.enrollmentCount) >= Number(section.maxStudents)) {
      return res.status(400).json({ message: 'Lớp học phần đã đủ số lượng sinh viên.' });
    }

    await run('INSERT INTO enrollments (sectionId, studentId) VALUES (?, ?)', [id, student.id]);
    return res.json({ message: 'Đăng ký môn học thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi đăng ký môn học.' });
  }
});

app.delete('/api/sections/:id/register', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const existed = await get('SELECT id FROM enrollments WHERE sectionId = ? AND studentId = ?', [id, student.id]);
    if (!existed) {
      return res.status(404).json({ message: 'Bạn chưa đăng ký lớp học phần này.' });
    }

    await run('DELETE FROM enrollments WHERE sectionId = ? AND studentId = ?', [id, student.id]);
    return res.json({ message: 'Hủy đăng ký môn học thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi hủy đăng ký môn học.' });
  }
});


app.get('/api/feedbacks', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const feedbacks = await all(
      `SELECT f.*, s.studentCode, s.fullName, s.className, s.major
       FROM feedbacks f
       JOIN students s ON s.id = f.studentId
       ORDER BY CASE f.status
         WHEN 'new' THEN 1
         WHEN 'in_progress' THEN 2
         ELSE 3
       END, f.createdAt DESC`
    );

    return res.json(feedbacks);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách ý kiến.' });
  }
});

app.get('/api/feedbacks/me', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const student = await getCurrentStudentByUserId(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên.' });
    }

    const feedbacks = await all(
      `SELECT * FROM feedbacks
       WHERE studentId = ?
       ORDER BY createdAt DESC`,
      [student.id]
    );

    return res.json(feedbacks);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy ý kiến của sinh viên.' });
  }
});

app.post('/api/feedbacks', authMiddleware, requireRoles('student'), async (req, res) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!subject || !message) {
      return res.status(400).json({
        message: 'Vui lòng nhập tiêu đề và nội dung ý kiến.'
      });
    }

    if (subject.length < 6 || subject.length > 30) {
      return res.status(400).json({
        message: 'Tiêu đề ý kiến phải có từ 6 đến 30 ký tự.'
      });
    }

    if (message.length < 6 || message.length > 200) {
      return res.status(400).json({
        message: 'Nội dung ý kiến phải có từ 6 đến 200 ký tự.'
      });
    }

    const student = await getCurrentStudentByUserId(req.user.id);

    if (!student) {
      return res.status(404).json({
        message: 'Không tìm thấy sinh viên.'
      });
    }

    const result = await run(
      `INSERT INTO feedbacks (studentId, subject, message)
       VALUES (?, ?, ?)`,
      [student.id, subject, message]
    );

    const feedback = await get(
      'SELECT * FROM feedbacks WHERE id = ?',
      [result.id]
    );

    return res.status(201).json({
      message: 'Gửi ý kiến thành công.',
      feedback
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Lỗi server khi gửi ý kiến.'
    });
  }
});

app.put('/api/feedbacks/:id/reply', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { adminReply, status } = req.body;

    const current = await get('SELECT * FROM feedbacks WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy ý kiến này.' });
    }

    await run(
      `UPDATE feedbacks
       SET adminReply = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminReply || '', status || current.status, id]
    );

    const feedback = await get('SELECT * FROM feedbacks WHERE id = ?', [id]);
    return res.json({ message: 'Cập nhật phản hồi thành công.', feedback });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi phản hồi ý kiến.' });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server chạy tại http://0.0.0.0:${PORT}`);
      console.log('API tin tức khả dụng tại GET /api/news');
    });
  })
  .catch((error) => {
    console.error('Không thể khởi tạo database:', error);
  });
