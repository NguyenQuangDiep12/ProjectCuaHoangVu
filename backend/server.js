const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { initDatabase, run, get, all } = require('./db');
const { createToken, authMiddleware, requireRoles } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  'http://localhost:5173',
  'https://studentmanagement-9quh.onrender.com',
  ...(process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
];

app.use(cors({
  origin: [...new Set(allowedOrigins)],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const ROLE_STAFF = ['admin', 'lecturer'];
const WEEKDAY_ORDER = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const BUILDINGS = ['Khu A', 'Khu B', 'A1', 'Khu C'];


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
  building,
  room,
  createdBy = null,
  excludeId = null,
  startDate,
  endDate
}) {
  const rows = await all(
     `SELECT sc.*, c.courseCode, c.courseName
     FROM schedules sc
     LEFT JOIN courses c ON c.id = sc.courseId
     WHERE sc.dayOfWeek = ? AND (? IS NULL OR sc.id != ?)` ,
    [dayOfWeek, excludeId, excludeId]
  );

  return rows.find((row) => {
    const datesOverlap = row.startDate && row.endDate
      ? row.startDate <= endDate && startDate <= row.endDate
      : row.semester === semester;
    if (!datesOverlap) return false;
    const overlap = hasTimeOverlap(startTime, endTime, row.startTime, row.endTime);
    if (!overlap) return false;

    const sameClass = String(row.className || '').trim().toLowerCase() === String(className || '').trim().toLowerCase();
    const sameRoom = String(row.room || '').trim().toLowerCase() === String(room || '').trim().toLowerCase()
      && (!row.building || !building || String(row.building).trim().toLocaleLowerCase('vi') === String(building).trim().toLocaleLowerCase('vi'));
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
  if (conflictRow.building) conflictParts.push(`tòa ${conflictRow.building}`);
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
function validateSectionDates({ startDate, endDate }) {
    const dates = [startDate, endDate];
    if (
        dates.some((date) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return true;
            const parsed = new Date(`${date}T00:00:00Z`);
            return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date;
        })
    )
        return "Vui lòng nhập đủ ngày bắt đầu và ngày kết thúc học phần hợp lệ.";
    if (startDate > endDate) return "Ngày bắt đầu học phần phải trước hoặc bằng ngày kết thúc học phần.";
    return "";
}

function validateScheduleDates({ startDate, endDate }) {
    const dates = [startDate, endDate];
    if (
        dates.some((date) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return true;
            const parsed = new Date(`${date}T00:00:00Z`);
            return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date;
        })
    ) return "Vui lòng nhập ngày bắt đầu và ngày kết thúc lịch học hợp lệ.";
    if (startDate > endDate) return "Ngày bắt đầu lịch học phải trước hoặc bằng ngày kết thúc.";
    return "";
}

function isRegistrationOpen(section) {
    return section.status === "open";
}

async function findSectionConflict({
    building,
    room,
    dayOfWeek,
    startTime,
    endTime,
    startDate,
    endDate,
    semester,
    lecturerId,
    excludeId = null,
}) {
    const candidates = await all(
        `SELECT se.*, c.courseCode, c.courseName
     FROM sections se JOIN courses c ON c.id = se.courseId
     WHERE se.dayOfWeek = ? AND (? IS NULL OR se.id != ?)`,
        [dayOfWeek, excludeId, excludeId]
    );
    const normalize = (value) =>
        String(value || "")
            .trim()
            .toLocaleLowerCase("vi");
    return (
        candidates.find((section) => {
            const datesOverlap =
                section.startDate && section.endDate
                    ? section.startDate <= endDate && startDate <= section.endDate
                    : section.semester === semester;
            if (!datesOverlap || !hasTimeOverlap(startTime, endTime, section.startTime, section.endTime)) return false;
            const sameRoom =
                normalize(section.building) === normalize(building) && normalize(section.room) === normalize(room);
            const sameLecturer = Number(section.lecturerId) === Number(lecturerId);
            if (!sameRoom && !sameLecturer) return false;
            section.conflictType = sameRoom ? "room" : "lecturer";
            return true;
        }) || null
    );
}

async function findStudentSectionConflict(studentId, candidate) {
    const registered = await all(
        `SELECT se.* FROM enrollments en JOIN sections se ON se.id = en.sectionId
     WHERE en.studentId = ?`,
        [studentId]
    );
    return (
        registered.find((section) => {
            if (
                section.dayOfWeek !== candidate.dayOfWeek ||
                !hasTimeOverlap(candidate.startTime, candidate.endTime, section.startTime, section.endTime)
            )
                return false;
            if (section.startDate && section.endDate && candidate.startDate && candidate.endDate) {
                return section.startDate <= candidate.endDate && candidate.startDate <= section.endDate;
            }
            return section.semester === candidate.semester;
        }) || null
    );
}

async function findScheduleSectionConflict({ building, room, dayOfWeek, startTime, endTime, semester, lecturerId, startDate, endDate }) {
    const sections = await all(
        "SELECT se.*, c.courseCode, c.courseName FROM sections se JOIN courses c ON c.id = se.courseId WHERE se.dayOfWeek = ?",
        [dayOfWeek]
    );
    const normalize = (value) =>
        String(value || "")
            .trim()
            .toLocaleLowerCase("vi");
    return (
        sections.find((section) => {
            const samePeriod = section.startDate && section.endDate && startDate && endDate
                ? section.startDate <= endDate && startDate <= section.endDate
                : section.semester === semester;
            const sameRoom =
                normalize(section.room) === normalize(room) &&
                (!section.building || !building || normalize(section.building) === normalize(building));
            const sameLecturer = Number(section.lecturerId) === Number(lecturerId);
            return (
                samePeriod &&
                hasTimeOverlap(startTime, endTime, section.startTime, section.endTime) &&
                (sameRoom || sameLecturer)
            );
        }) || null
    );
}

function buildSectionConflictMessage(conflict, dayOfWeek) {
    const reason =
        conflict.conflictType === "room"
            ? `tòa ${conflict.building}, phòng ${conflict.room}`
            : `lịch giảng của giảng viên với môn ${conflict.courseName} (${conflict.courseCode})`;
    return `Trùng ${reason} vào ${dayOfWeek}, ${conflict.startTime}–${conflict.endTime} trong thời gian học phần giao nhau. Vui lòng đổi tòa/phòng, ngày hoặc giờ.`;
}

function validateRegistration(body, role) {
    const clean = (value) => String(value ?? "").trim();
    const errors = [];
    const username = clean(body.username);
    const password = String(body.password ?? "");
    const fullName = clean(body.fullName);
    const email = clean(body.email).toLowerCase();
    const phone = clean(body.phone);
    const dob = clean(body.dob);
    if (!/^[A-Za-z0-9_.-]{12,50}$/.test(username))
        errors.push("Username phải dài 12-50 ký tự, chỉ gồm chữ, số, dấu ., _ hoặc -.");
    if (password.length < 6 || password.length > 30)
        errors.push("Mật khẩu phải dài từ 6 đến 30 ký tự.");
    if (fullName.length < 12 || fullName.length > 50 || /[^\p{L}\p{M}\s'.-]/u.test(fullName))
        errors.push("Họ tên phải có 12-50 ký tự và chỉ gồm chữ, khoảng trắng, dấu nháy hoặc gạch nối.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push("Email không hợp lệ.");
    if (!['student', 'lecturer'].includes(role)) errors.push("Vui lòng chọn vai trò sinh viên hoặc giảng viên.");
    if (role === "student" && (!clean(body.className) || clean(body.className).length > 32))
        errors.push("Lớp học bắt buộc, tối đa 32 ký tự.");
    if (role === "student" && !clean(body.major))
        errors.push("Ngành học bắt buộc.");
    if (!["Nam", "Nữ", "Khác"].includes(body.gender)) errors.push("Vui lòng chọn giới tính hợp lệ.");
    const parsedDob = new Date(`${dob}T00:00:00Z`);
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
        Number.isNaN(parsedDob.getTime()) ||
        parsedDob.toISOString().slice(0, 10) !== dob ||
        parsedDob >= new Date()
    )
        errors.push("Ngày sinh không hợp lệ hoặc phải nằm trong quá khứ.");
    if (!/^\d{9,10}$/.test(phone)) errors.push("Số điện thoại phải gồm 9–10 chữ số.");
    return { errors, username, fullName, email, phone, dob };
}


async function generateNextStudentCode() {
  const sequence = await get('UPDATE student_code_sequence SET lastValue = lastValue + 1 WHERE id = 1 RETURNING lastValue');
  if (!sequence || sequence.lastValue > 9999999) throw new Error('Đã hết dải mã sinh viên 222xxxxxxx.');
  return `222${String(sequence.lastValue).padStart(7, '0')}`;
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
      lecturerCode,
      className,
      major,
      department,
      degree,
      gender,
      dob,
      phone
    } = req.body;

    const checked = validateRegistration(req.body, role);
    if (checked.errors.length) return res.status(400).json({ message: checked.errors.join('\n') });
    const { username: cleanUsername, fullName: cleanFullName, email: cleanEmail, phone: cleanPhone, dob: cleanDob } = checked;
    const studentCode = role === 'student' ? await generateNextStudentCode() : null;

    const existedUser = await get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [cleanUsername, cleanEmail]
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

    const hashedPassword = await bcrypt.hash(password, 12);

    const createdUser = await run(
      `INSERT INTO users (username, password, role, fullName, email, studentCode, lecturerCode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cleanUsername, hashedPassword, role, cleanFullName, cleanEmail, role === 'student' ? studentCode : null, role === 'lecturer' ? finalLecturerCode : null]
    );

    if (role === 'student') {
      await run(
        `INSERT INTO students (studentCode, fullName, email, className, major, gender, dob, phone, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentCode,
          cleanFullName,
          cleanEmail,
          className || '',
          major || '',
          gender || '',
          cleanDob,
          cleanPhone,
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
          cleanFullName,
          cleanEmail,
          department || '',
          degree || '',
          gender || '',
          cleanDob,
          cleanPhone,
          createdUser.id
        ]
      );
    }

    return res.status(201).json({ message: 'Đăng ký tài khoản thành công.', studentCode });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi đăng ký.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username ?? '');
    const password = String(req.body?.password ?? '');

    if (!/^[A-Za-z0-9_.-]{12,50}$/.test(username)) {
      return res.status(400).json({ message: 'Username phải dài 12-50 ký tự, chỉ gồm chữ, số, dấu ., _ hoặc -.' });
    }
    if (password.length < 6 || password.length > 30) {
      return res.status(400).json({ message: 'Mật khẩu phải dài từ 6 đến 30 ký tự.' });
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
    const courses = req.user.role === 'lecturer'
      ? await all('SELECT * FROM courses WHERE ownerUserId = ? ORDER BY courseCode ASC', [req.user.id])
      : await all('SELECT * FROM courses ORDER BY courseCode ASC');
    return res.json(courses);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh sách môn học.' });
  }
});

app.post('/api/courses', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { courseCode, courseName, credits, lecturerName } = req.body;
    const normalizedCode = String(courseCode || '').trim();
    const normalizedName = String(courseName || '').trim();
    const creditText = String(credits ?? '');
    const creditCount = Number(creditText);
    if (!/^[A-Z0-9-]{2,20}$/.test(normalizedCode)) return res.status(400).json({ message: 'Mã môn học phải gồm 2–20 ký tự in hoa, số hoặc dấu gạch ngang.' });
    if (normalizedName.length < 12 || normalizedName.length > 50) return res.status(400).json({ message: 'Tên môn học phải từ 12–50 ký tự.' });
    if (!/^\d+$/.test(creditText) || !Number.isInteger(creditCount) || creditCount < 1 || creditCount > 10) return res.status(400).json({ message: 'Số tín chỉ phải là số nguyên từ 1 đến 10.' });

    const existed = await get('SELECT id FROM courses WHERE LOWER(courseCode) = LOWER(?)', [normalizedCode]);
    if (existed) {
      return res.status(400).json({ message: 'Mã môn học đã tồn tại.' });
    }

    const normalizedLecturerName = await getCurrentLecturerName(req, lecturerName);

    const result = await run(
      `INSERT INTO courses (courseCode, courseName, credits, lecturerName, ownerUserId)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedCode, normalizedName, creditCount, normalizedLecturerName, req.user.role === 'lecturer' ? req.user.id : null]
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
    const current = await get('SELECT * FROM courses WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy môn học.' });
    }

    const normalizedCode = String(courseCode || '').trim();
    const normalizedName = String(courseName || '').trim();
    const creditText = String(credits ?? '');
    const creditCount = Number(creditText);
    if (!/^[A-Z0-9-]{2,20}$/.test(normalizedCode)) return res.status(400).json({ message: 'Mã môn học phải gồm 2–20 ký tự in hoa, số hoặc dấu gạch ngang.' });
    if (normalizedName.length < 12 || normalizedName.length > 50) return res.status(400).json({ message: 'Tên môn học phải từ 12–50 ký tự.' });
    if (!/^\d+$/.test(creditText) || !Number.isInteger(creditCount) || creditCount < 1 || creditCount > 10) return res.status(400).json({ message: 'Số tín chỉ phải là số nguyên từ 1 đến 10.' });
    if (req.user.role === 'lecturer' && Number(current.ownerUserId) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được sửa môn học do mình tạo.' });

    const duplicate = await get('SELECT id FROM courses WHERE LOWER(courseCode) = LOWER(?) AND id != ?', [normalizedCode, id]);
    if (duplicate) {
      return res.status(400).json({ message: 'Mã môn học đã tồn tại ở môn khác.' });
    }

    const normalizedLecturerName = await getCurrentLecturerName(req, lecturerName);

    await run(
      `UPDATE courses
       SET courseCode = ?, courseName = ?, credits = ?, lecturerName = ?
       WHERE id = ?`,
      [normalizedCode, normalizedName, creditCount, normalizedLecturerName, id]
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

    if (req.user.role === 'lecturer' && Number(current.ownerUserId) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được xóa môn học do mình tạo.' });

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

    const [enrollment, grade, feedback] = await Promise.all([
      get('SELECT id FROM enrollments WHERE studentId = ? LIMIT 1', [id]),
      get('SELECT id FROM grades WHERE studentId = ? LIMIT 1', [id]),
      get('SELECT id FROM feedbacks WHERE studentId = ? LIMIT 1', [id])
    ]);
    if (enrollment || grade || feedback) return res.status(400).json({ message: 'Không thể xóa sinh viên đã có đăng ký, điểm hoặc ý kiến để bảo toàn lịch sử học vụ.' });

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
       WHERE (? != 'lecturer' OR EXISTS (
         SELECT 1 FROM enrollments en JOIN sections se ON se.id = en.sectionId
         WHERE en.studentId = g.studentId AND se.courseId = g.courseId AND se.semester = g.semester AND se.lecturerId = ?
       ))
       ORDER BY g.semester DESC, s.studentCode ASC, c.courseCode ASC`
      , [req.user.role, req.user.id]
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
    const gradeNotes = notes == null ? '' : String(notes);

    if ([...gradeNotes].length > 500) {
      return res.status(400).json({ message: 'Ghi chú không được vượt quá 500 ký tự.' });
    }

    if (!studentId || !courseId || !semester) {
      return res.status(400).json({ message: 'Vui lòng chọn sinh viên, môn học và học kỳ.' });
    }
    if (![midterm, final].every((score) => Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 10)) {
      return res.status(400).json({ message: 'Điểm giữa kỳ và cuối kỳ phải là số từ 0 đến 10.' });
    }
    const enrolled = await get(`SELECT en.id FROM enrollments en JOIN sections se ON se.id = en.sectionId
      WHERE en.studentId = ? AND se.courseId = ? AND se.semester = ? AND (? != 'lecturer' OR se.lecturerId = ?) LIMIT 1`, [studentId, courseId, String(semester).trim(), req.user.role, req.user.id]);
    if (!enrolled) return res.status(400).json({ message: 'Chỉ được chấm điểm sinh viên đã đăng ký lớp học phần của môn và học kỳ này.' });

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
      [studentId, courseId, semester, roundScore(midterm), roundScore(final), total, letterGrade, gradeNotes]
    );

    const created = await get('SELECT * FROM grades WHERE id = ?', [result.id]);
    await run('INSERT INTO grade_audit (gradeId, actorUserId, action, beforeData, afterData) VALUES (?, ?, \'created\', ?, ?)', [result.id, req.user.id, '{}', JSON.stringify(created)]);
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
    const gradeNotes = notes == null ? '' : String(notes);

    if ([...gradeNotes].length > 500) {
      return res.status(400).json({ message: 'Ghi chú không được vượt quá 500 ký tự.' });
    }

    const current = await get('SELECT * FROM grades WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm.' });
    }

    if (req.user.role === 'lecturer') {
      const ownedCurrent = await get(`SELECT en.id FROM enrollments en JOIN sections se ON se.id = en.sectionId
        WHERE en.studentId = ? AND se.courseId = ? AND se.semester = ? AND se.lecturerId = ? LIMIT 1`, [current.studentId, current.courseId, current.semester, req.user.id]);
      if (!ownedCurrent) return res.status(403).json({ message: 'Bạn chỉ được sửa điểm thuộc lớp học phần do mình phụ trách.' });
    }

    if (!studentId || !courseId || !String(semester || '').trim() || ![midterm, final].every((score) => Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 10)) {
      return res.status(400).json({ message: 'Sinh viên, môn học, học kỳ bắt buộc; điểm phải là số từ 0 đến 10.' });
    }
    const enrolled = await get(`SELECT en.id FROM enrollments en JOIN sections se ON se.id = en.sectionId
      WHERE en.studentId = ? AND se.courseId = ? AND se.semester = ? AND (? != 'lecturer' OR se.lecturerId = ?) LIMIT 1`, [studentId, courseId, String(semester).trim(), req.user.role, req.user.id]);
    if (!enrolled) return res.status(400).json({ message: 'Sinh viên chưa đăng ký lớp học phần tương ứng.' });

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
      [studentId, courseId, semester, roundScore(midterm), roundScore(final), total, letterGrade, gradeNotes, id]
    );

    const updated = await get('SELECT * FROM grades WHERE id = ?', [id]);
    await run('INSERT INTO grade_audit (gradeId, actorUserId, action, beforeData, afterData) VALUES (?, ?, \'updated\', ?, ?)', [id, req.user.id, JSON.stringify(current), JSON.stringify(updated)]);
    return res.json({ message: 'Cập nhật điểm thành công.', grade: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật điểm.' });
  }
});

app.delete('/api/grades/:id', authMiddleware, requireRoles(...ROLE_STAFF), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await get('SELECT * FROM grades WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm.' });
    }

    if (req.user.role === 'lecturer') {
      const owned = await get(`SELECT en.id FROM enrollments en JOIN sections se ON se.id = en.sectionId
        WHERE en.studentId = ? AND se.courseId = ? AND se.semester = ? AND se.lecturerId = ? LIMIT 1`, [current.studentId, current.courseId, current.semester, req.user.id]);
      if (!owned) return res.status(403).json({ message: 'Bạn chỉ được xóa điểm thuộc lớp học phần do mình phụ trách.' });
    }

    await run('INSERT INTO grade_audit (gradeId, actorUserId, action, beforeData) VALUES (?, ?, \'deleted\', ?)', [id, req.user.id, JSON.stringify(current)]);

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
       ${req.user.role === 'lecturer' ? 'WHERE sc.createdBy = ?' : ''}
       ORDER BY sc.semester DESC, CASE sc.dayOfWeek
         WHEN 'Thứ 2' THEN 1
         WHEN 'Thứ 3' THEN 2
         WHEN 'Thứ 4' THEN 3
         WHEN 'Thứ 5' THEN 4
         WHEN 'Thứ 6' THEN 5
         WHEN 'Thứ 7' THEN 6
         ELSE 7
       END, sc.startTime ASC`,
      req.user.role === 'lecturer' ? [req.user.id] : []
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
      `SELECT se.id, se.courseId, se.sectionCode AS className, se.building, se.room, se.dayOfWeek, se.startTime, se.endTime, se.semester, se.startDate, se.endDate,
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
    const { courseId, className, building, room, dayOfWeek, daysOfWeek, startTime, endTime, semester, startDate, endDate } = req.body;

    if (!courseId || !className || !BUILDINGS.includes(building) || !room || (!dayOfWeek && !(Array.isArray(daysOfWeek) && daysOfWeek.length)) || !startTime || !endTime || !semester) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin lịch học.' });
    }
    const datesError = validateScheduleDates({ startDate, endDate });
    if (datesError) return res.status(400).json({ message: datesError });
    const courseOwner = await get('SELECT ownerUserId FROM courses WHERE id = ?', [courseId]);
    if (!courseOwner) return res.status(400).json({ message: 'Môn học không tồn tại.' });
    if (req.user.role === 'lecturer' && Number(courseOwner.ownerUserId) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được tạo lịch cho môn học do mình tạo.' });

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
        building,
        room,
        createdBy: req.user.id,
        startDate,
        endDate
      });

      if (conflict) {
        return res.status(400).json({ message: buildConflictMessage(conflict, day) });
      }
      const sectionConflict = await findScheduleSectionConflict({ building, room, dayOfWeek: day, startTime, endTime, semester, lecturerId: req.user.id, startDate, endDate });
      if (sectionConflict) return res.status(400).json({ message: buildSectionConflictMessage(sectionConflict, day) });
    }

    const createdSchedules = [];
    for (const day of validDays) {
      const result = await run(
        `INSERT INTO schedules (courseId, className, building, room, dayOfWeek, startTime, endTime, semester, startDate, endDate, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, className, building, room, day, startTime, endTime, semester, startDate, endDate, req.user.id]
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
    const { courseId, className, building, room, dayOfWeek, startTime, endTime, semester, startDate, endDate } = req.body;

    const current = await get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lịch học.' });
    }
    if (req.user.role === 'lecturer' && Number(current.createdBy) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được sửa lịch học do mình tạo.' });
    const datesError = validateScheduleDates({ startDate, endDate });
    if (datesError) return res.status(400).json({ message: datesError });
    const courseOwner = await get('SELECT ownerUserId FROM courses WHERE id = ?', [courseId]);
    if (!courseOwner) return res.status(400).json({ message: 'Môn học không tồn tại.' });
    if (req.user.role === 'lecturer' && Number(courseOwner.ownerUserId) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được xếp lịch cho môn học do mình tạo.' });

    if (!WEEKDAY_ORDER.includes(dayOfWeek)) {
      return res.status(400).json({ message: 'Ngày học không hợp lệ.' });
    }
    if (!BUILDINGS.includes(building) || !String(room || '').trim()) return res.status(400).json({ message: 'Vui lòng chọn tòa nhà và nhập phòng hợp lệ.' });

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return res.status(400).json({ message: 'Giờ kết thúc phải lớn hơn giờ bắt đầu.' });
    }

    const conflict = await findScheduleConflict({
      semester,
      dayOfWeek,
      startTime,
      endTime,
      className,
      building,
      room,
      createdBy: current.createdBy || req.user.id,
      excludeId: id,
      startDate,
      endDate
    });

    if (conflict) {
      return res.status(400).json({ message: buildConflictMessage(conflict, dayOfWeek) });
    }
    const sectionConflict = await findScheduleSectionConflict({ building, room, dayOfWeek, startTime, endTime, semester, lecturerId: current.createdBy || req.user.id, startDate, endDate });
    if (sectionConflict) return res.status(400).json({ message: buildSectionConflictMessage(sectionConflict, dayOfWeek) });

    await run(
      `UPDATE schedules
       SET courseId = ?, className = ?, building = ?, room = ?, dayOfWeek = ?, startTime = ?, endTime = ?, semester = ?, startDate = ?, endDate = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [courseId, className, building, room, dayOfWeek, startTime, endTime, semester, startDate, endDate, id]
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
    const current = await get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lịch học.' });
    }
    if (req.user.role === 'lecturer' && Number(current.createdBy) !== Number(req.user.id)) return res.status(403).json({ message: 'Bạn chỉ được xóa lịch học do mình tạo.' });

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
    const { courseId, sectionCode, building, room, dayOfWeek, startTime, endTime, semester, maxStudents, status, startDate, endDate } = req.body;
    const normalizedSectionCode = String(sectionCode || '').trim();
    const studentCapacity = Number(maxStudents ?? 50);

    if (!courseId || !normalizedSectionCode || !String(building || '').trim() || !String(room || '').trim() || !dayOfWeek || !startTime || !endTime || !semester) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin lớp học phần.' });
    }
    if (!/^[A-Z0-9-]{2,20}$/.test(normalizedSectionCode))
      return res.status(400).json({ message: 'Mã lớp học phần phải gồm 2–20 ký tự in hoa, số hoặc dấu gạch ngang.' });
    if (String(semester).trim().length < 6 || String(semester).trim().length > 20)
      return res.status(400).json({ message: 'Học kỳ học phải dài từ 6 đến 20 ký tự.' });
    const courseOwner = await get("SELECT id, ownerUserId FROM courses WHERE id = ?", [courseId]);
    if (!courseOwner) return res.status(400).json({ message: "Môn học không tồn tại." });
    if (req.user.role === "lecturer" && Number(courseOwner.ownerUserId) !== Number(req.user.id))
        return res.status(403).json({ message: "Bạn chỉ được mở lớp cho môn học do mình tạo." });
    if (String(room).trim().length < 4 || String(room).trim().length > 30)
        return res.status(400).json({ message: "Phòng học phải từ 4 đến 30 ký tự." });
    if (!BUILDINGS.includes(String(building).trim()))
        return res.status(400).json({ message: "Tòa nhà không hợp lệ. Chọn Khu A, Khu B, A1 hoặc Khu C." });
    if (
        !WEEKDAY_ORDER.includes(dayOfWeek) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
        timeToMinutes(endTime) <= timeToMinutes(startTime)
    )
        return res
            .status(400)
            .json({ message: "Ngày học hoặc khung giờ không hợp lệ giờ kết thúc phải sau giờ bắt đầu." });
    if (!Number.isInteger(studentCapacity) || studentCapacity < 1 || studentCapacity > 120)
        return res.status(400).json({ message: "Sĩ số tối đa phải là số nguyên từ 1 đến 120." });
    const datesError = validateSectionDates({ startDate, endDate });
    if (datesError) return res.status(400).json({ message: datesError });
    if (status && !["open", "closed"].includes(status))
        return res.status(400).json({ message: "Trạng thái đăng ký không hợp lệ." });
    const conflict = await findSectionConflict({
        building,
        room,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        semester,
        lecturerId: req.user.id,
    });
    if (conflict) return res.status(400).json({ message: buildSectionConflictMessage(conflict, dayOfWeek) });
    const scheduleConflict = await findScheduleConflict({
        semester,
        dayOfWeek,
        startTime,
        endTime,
        className: normalizedSectionCode,
        building,
        room,
        createdBy: req.user.id,
        startDate,
        endDate,
    });
    if (scheduleConflict) return res.status(400).json({ message: buildConflictMessage(scheduleConflict, dayOfWeek) });

    const existed = await get('SELECT id FROM sections WHERE LOWER(sectionCode) = LOWER(?)', [normalizedSectionCode]);
    if (existed) {
      return res.status(400).json({ message: 'Mã lớp học phần đã tồn tại.' });
    }

    const result = await run(
      `INSERT INTO sections (courseId, sectionCode, lecturerId, building, room, dayOfWeek, startTime, endTime, semester, maxStudents, status, startDate, endDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [courseId, normalizedSectionCode, req.user.id, building.trim(), room.trim(), dayOfWeek, startTime, endTime, semester.trim(), studentCapacity, status || 'open', startDate, endDate]
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
    const { courseId, sectionCode, building, room, dayOfWeek, startTime, endTime, semester, maxStudents, status, startDate, endDate } = req.body;
    const normalizedSectionCode = String(sectionCode || '').trim();

    const current = await get('SELECT * FROM sections WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học phần.' });
    }

    if (req.user.role === 'lecturer' && Number(current.lecturerId) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Bạn chỉ được sửa lớp học phần do mình tạo.' });
    }
    const enrollmentCount = await get("SELECT COUNT(*) AS count FROM enrollments WHERE sectionId = ?", [id]);
    const datesError = validateSectionDates({ startDate, endDate });
    if (datesError) return res.status(400).json({ message: datesError });
    if (status && !["open", "closed"].includes(status))
        return res.status(400).json({ message: "Trạng thái đăng ký không hợp lệ." });
    if (
        !courseId ||
        !normalizedSectionCode ||
        !String(building || "").trim() ||
        !String(room || "").trim() ||
        !String(semester || "").trim() ||
        !WEEKDAY_ORDER.includes(dayOfWeek) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || "") ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || "") ||
        timeToMinutes(endTime) <= timeToMinutes(startTime)
    ) {
        return res.status(400).json({ message: "Thông tin lớp không hợp lệ; giờ kết thúc phải sau giờ bắt đầu." });
    }
    if (String(semester).trim().length < 6 || String(semester).trim().length > 20)
        return res.status(400).json({ message: 'Học kỳ học phải dài từ 6 đến 20 ký tự.' });
    if (!/^[A-Z0-9-]{2,20}$/.test(normalizedSectionCode))
        return res.status(400).json({ message: 'Mã lớp học phần phải gồm 2–20 ký tự in hoa, số hoặc dấu gạch ngang.' });
    const courseOwner = await get("SELECT id, ownerUserId FROM courses WHERE id = ?", [courseId]);
    if (!courseOwner) return res.status(400).json({ message: "Môn học không tồn tại." });
    if (req.user.role === "lecturer" && Number(courseOwner.ownerUserId) !== Number(req.user.id))
        return res.status(403).json({ message: "Bạn chỉ được mở lớp cho môn học do mình tạo." });
    if (String(room).trim().length < 4 || String(room).trim().length > 30)
        return res.status(400).json({ message: "Phòng học phải từ 4 đến 30 ký tự." });
    if (!BUILDINGS.includes(String(building).trim()))
        return res.status(400).json({ message: "Tòa nhà không hợp lệ. Chọn Khu A, Khu B, A1 hoặc Khu C." });
    if (
        !Number.isInteger(Number(maxStudents)) ||
        Number(maxStudents) < Number(enrollmentCount.count) ||
        Number(maxStudents) > 120
    ) {
        return res.status(400).json({ message: `Sĩ số tối đa phải từ số đã đăng ký (${enrollmentCount.count}) đến 120.` });
    }
    const datesChanged = startDate !== current.startDate || endDate !== current.endDate;
    if (datesChanged) {
        const hasSectionGrades = await get("SELECT id FROM grades WHERE courseId = ? AND semester = ? LIMIT 1", [
            current.courseId,
            current.semester,
        ]);
        if (Number(enrollmentCount.count) > 0 || hasSectionGrades) {
            return res
                .status(400)
                .json({
                    message:
                        "Không thể đổi ngày học phần khi lớp đã có sinh viên đăng ký hoặc điểm, hãy đóng lớp và giữ nguyên lịch sử.",
                });
        }
    }
    if (Number(courseId) !== Number(current.courseId) || String(semester) !== current.semester) {
        const hasGrades = await get("SELECT id FROM grades WHERE courseId = ? AND semester = ? LIMIT 1", [
            current.courseId,
            current.semester,
        ]);
        if (Number(enrollmentCount.count) || hasGrades)
            return res
                .status(400)
                .json({ message: "Không thể đổi môn/học kỳ khi lớp đã có sinh viên đăng ký hoặc đã phát sinh điểm." });
    }

    const conflict = await findSectionConflict({
        building,
        room,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        semester,
        lecturerId: current.lecturerId,
        excludeId: id,
    });
    if (conflict) return res.status(400).json({ message: buildSectionConflictMessage(conflict, dayOfWeek) });
    const scheduleConflict = await findScheduleConflict({
        semester,
        dayOfWeek,
        startTime,
        endTime,
        className: normalizedSectionCode,
        building,
        room,
        createdBy: current.lecturerId,
        startDate,
        endDate,
    });
    if (scheduleConflict) return res.status(400).json({ message: buildConflictMessage(scheduleConflict, dayOfWeek) });

    const duplicate = await get('SELECT id FROM sections WHERE LOWER(sectionCode) = LOWER(?) AND id != ?', [normalizedSectionCode, id]);
    if (duplicate) {
      return res.status(400).json({ message: 'Mã lớp học phần đã tồn tại.' });
    }

    await run(
      `UPDATE sections
       SET courseId = ?, sectionCode = ?, building = ?, room = ?, dayOfWeek = ?, startTime = ?, endTime = ?, semester = ?, maxStudents = ?, status = ?, startDate = ?, endDate = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [courseId, normalizedSectionCode, building.trim(), room.trim(), dayOfWeek, startTime, endTime, semester.trim(), Number(maxStudents), status || 'open', startDate, endDate, id]
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

    const enrollmentCount = await get('SELECT COUNT(*) AS count FROM enrollments WHERE sectionId = ?', [id]);
    if (Number(enrollmentCount.count) > 0) return res.status(400).json({ message: 'Không thể xóa lớp đã có sinh viên đăng ký. Hãy đóng lớp hoặc hủy đăng ký trước.' });
    const relatedGrade = await get('SELECT id FROM grades WHERE courseId = ? AND semester = ? LIMIT 1', [current.courseId, current.semester]);
    if (relatedGrade) return res.status(400).json({ message: 'Không thể xóa lớp thuộc môn/học kỳ đã phát sinh điểm; hãy đóng lớp để lưu lịch sử học vụ.' });

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
    if (!isRegistrationOpen(section)) return res.status(400).json({ message: 'Lớp học phần đã đóng đăng ký.' });

    const existed = await get('SELECT id FROM enrollments WHERE sectionId = ? AND studentId = ?', [id, student.id]);
    if (existed) {
      return res.status(400).json({ message: 'Bạn đã đăng ký lớp học phần này rồi.' });
    }

    const sameCourse = await get(`SELECT en.id FROM enrollments en JOIN sections se ON se.id = en.sectionId
      WHERE en.studentId = ? AND se.courseId = ? AND se.semester = ? LIMIT 1`, [student.id, section.courseId, section.semester]);
    if (sameCourse) return res.status(400).json({ message: 'Bạn đã đăng ký lớp khác của môn học này trong học kỳ.' });

    const scheduleConflict = await findStudentSectionConflict(student.id, section);
    if (scheduleConflict) return res.status(400).json({ message: `Trùng lịch với lớp ${scheduleConflict.sectionCode} vào ${scheduleConflict.dayOfWeek}, ${scheduleConflict.startTime}–${scheduleConflict.endTime}.` });

    if (Number(section.enrollmentCount) >= Number(section.maxStudents)) {
      return res.status(400).json({ message: 'Lớp học phần đã đủ số lượng sinh viên.' });
    }

    const inserted = await run(
      `INSERT OR IGNORE INTO enrollments (sectionId, studentId)
       SELECT ?, ? WHERE (SELECT COUNT(*) FROM enrollments WHERE sectionId = ?) <
         (SELECT maxStudents FROM sections WHERE id = ?)`,
      [id, student.id, id, id]
    );
    if (!inserted.changes) {
      const racedDuplicate = await get('SELECT id FROM enrollments WHERE sectionId = ? AND studentId = ?', [id, student.id]);
      return res.status(409).json({ message: racedDuplicate ? 'Bạn đã đăng ký lớp học phần này rồi.' : 'Lớp học phần vừa đủ sĩ số.' });
    }
    return res.json({ message: 'Đăng ký môn học thành công.' });
  } catch (error) {
    if (String(error.message || '').includes('ENROLLMENT_CONFLICT')) return res.status(409).json({ message: 'Đăng ký bị trùng môn học trong học kỳ hoặc trùng lịch với lớp khác.' });
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

    const section = await get('SELECT * FROM sections WHERE id = ?', [id]);
    if (!section || !isRegistrationOpen(section)) return res.status(400).json({ message: 'Lớp học phần đã đóng đăng ký nên không thể hủy đăng ký.' });

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

    if (message.length < 6 || message.length > 255) {
      return res.status(400).json({
        message: 'Nội dung ý kiến phải có từ 6 đến 255 ký tự.'
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
