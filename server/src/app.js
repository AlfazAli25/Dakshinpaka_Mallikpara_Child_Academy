const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');

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
const admitCardRoutes = require('./routes/admit-card.routes');
const reportCardRoutes = require('./routes/report-card.routes');
const studentIdCardRoutes = require('./routes/student-id-card.routes');
const noticeRoutes = require('./routes/notice.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const systemRoutes = require('./routes/system.routes');
const pushNotificationRoutes = require('./routes/push-notification.routes');
const { SCHOOL_NAME } = require('./config/school');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const { attachRequestContext } = require('./middleware/request-context.middleware');
const { requestPerformanceLogger } = require('./middleware/request-performance.middleware');
const { rateLimitMiddleware } = require('./middleware/rate-limit.middleware');
const { responseCacheMiddleware, invalidateApiCache } = require('./middleware/response-cache.middleware');
const { responseStandardizeMiddleware } = require('./middleware/response-standardize.middleware');
const { logInfo } = require('./utils/logger');

const app = express();

const parseAllowedOrigins = () => {
  const rawOrigins = String(process.env.CLIENT_ORIGIN || 'http://localhost:3000');
  return rawOrigins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const allowedOrigins = new Set(parseAllowedOrigins());

const corsOriginHandler = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  const error = new Error('CORS origin not allowed');
  error.statusCode = 403;
  callback(error);
};

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);
app.use(
  morgan('tiny', {
    stream: {
      write: (line) => {
        logInfo('http_request', {
          line: String(line || '').trim()
        });
      }
    }
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
app.use('/api', responseStandardizeMiddleware);
app.use('/api', rateLimitMiddleware);
app.use('/api', responseCacheMiddleware);

app.use((req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    invalidateApiCache().catch(() => {});
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
app.use('/api/receipt', receiptRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/admit-cards', admitCardRoutes);
app.use('/api/report-cards', reportCardRoutes);
app.use('/api/id-cards', studentIdCardRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', pushNotificationRoutes);
// UPI deep link API removed

app.use(notFound);
app.use(errorHandler);

module.exports = app;