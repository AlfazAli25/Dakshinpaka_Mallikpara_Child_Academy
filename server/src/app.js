const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const studentPanelRoutes = require('./routes/student-panel.routes');
const userRoutes = require('./routes/user.routes');
const studentRoutes = require('./routes/student.routes');
const teacherRoutes = require('./routes/teacher.routes');
const classRoutes = require('./routes/class.routes');
const subjectRoutes = require('./routes/subject.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const timetableRoutes = require('./routes/timetable.routes');
const examRoutes = require('./routes/exam.routes');
const gradeRoutes = require('./routes/grade.routes');
const feeRoutes = require('./routes/fee.routes');
const staffRoutes = require('./routes/staff.routes');
const payrollRoutes = require('./routes/payroll.routes');
const notificationRoutes = require('./routes/notification.routes');
const receiptRoutes = require('./routes/receipt.routes');
const { SCHOOL_NAME } = require('./config/school');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*'
  })
);
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer?.toString('utf8') || '';
    }
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: `${SCHOOL_NAME} API is running` });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentPanelRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/receipts', receiptRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;