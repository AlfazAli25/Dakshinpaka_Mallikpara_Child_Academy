const express = require('express');
const cors = require('cors');
const compression = require('compression');

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
const examRoutes = require('./routes/examRoutes');
const gradeRoutes = require('./routes/grade.routes');
const marksRoutes = require('./routes/marksRoutes');
const feeRoutes = require('./routes/fee.routes');
const staffRoutes = require('./routes/staff.routes');
const payrollRoutes = require('./routes/payroll.routes');
const notificationRoutes = require('./routes/notification.routes');
const receiptRoutes = require('./routes/receipt.routes');
const noticeRoutes = require('./routes/notice.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const systemRoutes = require('./routes/system.routes');
const { SCHOOL_NAME } = require('./config/school');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const { attachRequestContext } = require('./middleware/request-context.middleware');
const { requestPerformanceLogger } = require('./middleware/request-performance.middleware');
const { rateLimitMiddleware } = require('./middleware/rate-limit.middleware');
const { responseCacheMiddleware, invalidateApiCache } = require('./middleware/response-cache.middleware');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*'
  })
);
app.use(attachRequestContext);
app.use(requestPerformanceLogger);
app.use(
  compression({
    threshold: 1024
  })
);
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      req.rawBody = buffer?.toString('utf8') || '';
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api', rateLimitMiddleware);
app.use('/api', responseCacheMiddleware);

app.use((req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    invalidateApiCache();
  }
  next();
});

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
app.use('/api/timetable', timetableRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;