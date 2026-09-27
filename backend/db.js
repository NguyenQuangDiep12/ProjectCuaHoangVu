const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'school.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function createTables() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'lecturer', 'student')),
      fullName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      studentCode TEXT UNIQUE,
      lecturerCode TEXT UNIQUE,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('users', 'studentCode', 'TEXT');
  await ensureColumn('users', 'lecturerCode', 'TEXT');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_studentCode_unique ON users(studentCode)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lecturerCode_unique ON users(lecturerCode)');

  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentCode TEXT NOT NULL UNIQUE,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      className TEXT,
      major TEXT,
      gender TEXT,
      dob TEXT,
      phone TEXT,
      userId INTEGER UNIQUE,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lecturers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lecturerCode TEXT NOT NULL UNIQUE,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT,
      degree TEXT,
      gender TEXT,
      dob TEXT,
      phone TEXT,
      userId INTEGER UNIQUE,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseCode TEXT NOT NULL UNIQUE,
      courseName TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 3,
      lecturerName TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      courseId INTEGER NOT NULL,
      semester TEXT NOT NULL,
      midterm REAL DEFAULT 0,
      final REAL DEFAULT 0,
      total REAL DEFAULT 0,
      letterGrade TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(studentId, courseId, semester),
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL,
      className TEXT NOT NULL,
      room TEXT NOT NULL,
      dayOfWeek TEXT NOT NULL,
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      semester TEXT NOT NULL,
      createdBy INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL,
      sectionCode TEXT NOT NULL UNIQUE,
      lecturerId INTEGER NOT NULL,
      room TEXT NOT NULL,
      dayOfWeek TEXT NOT NULL,
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      semester TEXT NOT NULL,
      maxStudents INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY(lecturerId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sectionId INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sectionId, studentId),
      FOREIGN KEY(sectionId) REFERENCES sections(id) ON DELETE CASCADE,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'resolved')),
      adminReply TEXT DEFAULT '',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      content TEXT NOT NULL,
      category TEXT DEFAULT 'Thông báo',
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published')),
      isImportant INTEGER NOT NULL DEFAULT 0,
      createdBy INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

async function seedUser({ username, password, role, fullName, email, studentCode = null, lecturerCode = null }) {
  const existed = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existed) {
    if (studentCode || lecturerCode) {
      await run(
        `UPDATE users
         SET studentCode = COALESCE(studentCode, ?), lecturerCode = COALESCE(lecturerCode, ?)
         WHERE id = ?`,
        [studentCode, lecturerCode, existed.id]
      );
    }
    return existed.id;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await run(
    `INSERT INTO users (username, password, role, fullName, email, studentCode, lecturerCode)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, hashedPassword, role, fullName, email, studentCode, lecturerCode]
  );

  return result.id;
}

async function seedStudent(student) {
  const existed = await get('SELECT id FROM students WHERE studentCode = ?', [student.studentCode]);
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO students (studentCode, fullName, email, className, major, gender, dob, phone, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      student.studentCode,
      student.fullName,
      student.email,
      student.className,
      student.major,
      student.gender,
      student.dob,
      student.phone,
      student.userId || null
    ]
  );

  return result.id;
}

async function seedLecturer(lecturer) {
  const existed = await get('SELECT id FROM lecturers WHERE lecturerCode = ? OR userId = ?', [lecturer.lecturerCode, lecturer.userId || 0]);
  if (existed) {
    await run(
      `UPDATE users
       SET lecturerCode = COALESCE(lecturerCode, ?), fullName = COALESCE(fullName, ?), email = COALESCE(email, ?)
       WHERE id = ?`,
      [lecturer.lecturerCode, lecturer.fullName, lecturer.email, lecturer.userId]
    );
    return existed.id;
  }

  const result = await run(
    `INSERT INTO lecturers (lecturerCode, fullName, email, department, degree, gender, dob, phone, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lecturer.lecturerCode,
      lecturer.fullName,
      lecturer.email,
      lecturer.department || '',
      lecturer.degree || '',
      lecturer.gender || '',
      lecturer.dob || '',
      lecturer.phone || '',
      lecturer.userId || null
    ]
  );

  await run(
    `UPDATE users
     SET lecturerCode = ?, fullName = ?, email = ?
     WHERE id = ?`,
    [lecturer.lecturerCode, lecturer.fullName, lecturer.email, lecturer.userId]
  );

  return result.id;
}

async function seedCourse(course) {
  const existed = await get('SELECT id FROM courses WHERE courseCode = ?', [course.courseCode]);
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO courses (courseCode, courseName, credits, lecturerName)
     VALUES (?, ?, ?, ?)`,
    [course.courseCode, course.courseName, course.credits, course.lecturerName]
  );

  return result.id;
}

async function seedGrade(grade) {
  const existed = await get(
    'SELECT id FROM grades WHERE studentId = ? AND courseId = ? AND semester = ?',
    [grade.studentId, grade.courseId, grade.semester]
  );
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO grades (studentId, courseId, semester, midterm, final, total, letterGrade, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      grade.studentId,
      grade.courseId,
      grade.semester,
      grade.midterm,
      grade.final,
      grade.total,
      grade.letterGrade,
      grade.notes || ''
    ]
  );

  return result.id;
}

async function seedSchedule(schedule) {
  const existed = await get(
    `SELECT id FROM schedules
     WHERE courseId = ? AND className = ? AND dayOfWeek = ? AND startTime = ? AND semester = ?`,
    [schedule.courseId, schedule.className, schedule.dayOfWeek, schedule.startTime, schedule.semester]
  );

  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO schedules (courseId, className, room, dayOfWeek, startTime, endTime, semester, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schedule.courseId,
      schedule.className,
      schedule.room,
      schedule.dayOfWeek,
      schedule.startTime,
      schedule.endTime,
      schedule.semester,
      schedule.createdBy || null
    ]
  );

  return result.id;
}

async function seedSection(section) {
  const existed = await get('SELECT id FROM sections WHERE sectionCode = ?', [section.sectionCode]);
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO sections (courseId, sectionCode, lecturerId, room, dayOfWeek, startTime, endTime, semester, maxStudents, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      section.courseId,
      section.sectionCode,
      section.lecturerId,
      section.room,
      section.dayOfWeek,
      section.startTime,
      section.endTime,
      section.semester,
      section.maxStudents || 50,
      section.status || 'open'
    ]
  );

  return result.id;
}

async function seedEnrollment(enrollment) {
  const existed = await get(
    'SELECT id FROM enrollments WHERE sectionId = ? AND studentId = ?',
    [enrollment.sectionId, enrollment.studentId]
  );
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO enrollments (sectionId, studentId)
     VALUES (?, ?)`,
    [enrollment.sectionId, enrollment.studentId]
  );

  return result.id;
}

async function seedFeedback(feedback) {
  const existed = await get(
    'SELECT id FROM feedbacks WHERE studentId = ? AND subject = ? AND message = ?',
    [feedback.studentId, feedback.subject, feedback.message]
  );
  if (existed) return existed.id;

  const result = await run(
    `INSERT INTO feedbacks (studentId, subject, message, status, adminReply)
     VALUES (?, ?, ?, ?, ?)`,
    [
      feedback.studentId,
      feedback.subject,
      feedback.message,
      feedback.status || 'new',
      feedback.adminReply || ''
    ]
  );

  return result.id;
}

async function seedData() {
  const adminId = await seedUser({
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    fullName: 'System Admin',
    email: 'admin@school.local'
  });

  const lecturerId = await seedUser({
    username: 'lecturer1',
    password: 'lecturer123',
    role: 'lecturer',
    fullName: 'Nguyen Van Giang',
    email: 'lecturer1@school.local',
    lecturerCode: 'GV001'
  });

  await seedLecturer({
    lecturerCode: 'GV001',
    fullName: 'Nguyen Van Giang',
    email: 'lecturer1@school.local',
    department: 'Công nghệ thông tin',
    degree: 'Thạc sĩ',
    gender: 'Nam',
    dob: '1988-07-14',
    phone: '0912345678',
    userId: lecturerId
  });

  const studentUserId = await seedUser({
    username: 'student1',
    password: 'student123',
    role: 'student',
    fullName: 'Tran Minh Anh',
    email: 'student1@school.local',
    studentCode: 'SV001'
  });

  const studentOneId = await seedStudent({
    studentCode: 'SV001',
    fullName: 'Tran Minh Anh',
    email: 'student1@school.local',
    className: 'CNTT01',
    major: 'Công nghệ thông tin',
    gender: 'Nam',
    dob: '2004-05-15',
    phone: '0988888888',
    userId: studentUserId
  });

  const studentTwoId = await seedStudent({
    studentCode: 'SV002',
    fullName: 'Le Thu Ha',
    email: 'sv002@school.local',
    className: 'QTKD02',
    major: 'Quản trị kinh doanh',
    gender: 'Nữ',
    dob: '2004-08-20',
    phone: '0977777777'
  });

  const courseOneId = await seedCourse({
    courseCode: 'INT101',
    courseName: 'Lập trình Web',
    credits: 3,
    lecturerName: 'Nguyen Van Giang'
  });

  const courseTwoId = await seedCourse({
    courseCode: 'INT201',
    courseName: 'Cơ sở dữ liệu',
    credits: 3,
    lecturerName: 'Nguyen Van Giang'
  });

  const courseThreeId = await seedCourse({
    courseCode: 'BUS110',
    courseName: 'Nguyên lý quản trị',
    credits: 2,
    lecturerName: 'Pham Thu Trang'
  });

  await seedGrade({
    studentId: studentOneId,
    courseId: courseOneId,
    semester: 'HK1 2026',
    midterm: 8.5,
    final: 9.0,
    total: 8.8,
    letterGrade: 'A'
  });

  await seedGrade({
    studentId: studentOneId,
    courseId: courseTwoId,
    semester: 'HK1 2026',
    midterm: 7.5,
    final: 8.0,
    total: 7.8,
    letterGrade: 'B'
  });

  await seedGrade({
    studentId: studentTwoId,
    courseId: courseThreeId,
    semester: 'HK1 2026',
    midterm: 8.5,
    final: 8.0,
    total: 8.2,
    letterGrade: 'B+'
  });

  await seedSchedule({
    courseId: courseOneId,
    className: 'CNTT01',
    room: 'P.301-A1',
    dayOfWeek: 'Thứ 2',
    startTime: '07:00',
    endTime: '09:00',
    semester: 'HK1 2026',
    createdBy: lecturerId
  });

  await seedSchedule({
    courseId: courseTwoId,
    className: 'CNTT01',
    room: 'Lab 2',
    dayOfWeek: 'Thứ 4',
    startTime: '09:10',
    endTime: '11:10',
    semester: 'HK1 2026',
    createdBy: lecturerId
  });

  await seedSchedule({
    courseId: courseThreeId,
    className: 'QTKD02',
    room: 'P.205-B2',
    dayOfWeek: 'Thứ 3',
    startTime: '13:00',
    endTime: '15:00',
    semester: 'HK1 2026',
    createdBy: adminId
  });

  const sectionOneId = await seedSection({
    courseId: courseOneId,
    sectionCode: 'INT101-01',
    lecturerId,
    room: 'P.301-A1',
    dayOfWeek: 'Thứ 2',
    startTime: '07:00',
    endTime: '09:00',
    semester: 'HK1 2026',
    maxStudents: 60,
    status: 'open'
  });

  const sectionTwoId = await seedSection({
    courseId: courseTwoId,
    sectionCode: 'INT201-01',
    lecturerId,
    room: 'Lab 2',
    dayOfWeek: 'Thứ 4',
    startTime: '09:10',
    endTime: '11:10',
    semester: 'HK1 2026',
    maxStudents: 45,
    status: 'open'
  });

  await seedEnrollment({ sectionId: sectionOneId, studentId: studentOneId });
  await seedEnrollment({ sectionId: sectionTwoId, studentId: studentOneId });

  await seedFeedback({
    studentId: studentOneId,
    subject: 'Đề xuất mở thêm ca học',
    message: 'Em mong nhà trường mở thêm ca chiều cho môn Cơ sở dữ liệu để sinh viên dễ sắp xếp lịch hơn.',
    status: 'in_progress',
    adminReply: 'Admin đã ghi nhận và sẽ trao đổi với bộ môn trong tuần này.'
  });

  return { adminId, lecturerId, studentUserId };
}

async function initDatabase() {
  await createTables();
  await seedData();
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase
};