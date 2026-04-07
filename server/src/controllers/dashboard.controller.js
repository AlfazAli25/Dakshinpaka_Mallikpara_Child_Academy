const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const ClassModel = require('../models/class.model');
const Attendance = require('../models/attendance.model');
const Exam = require('../models/exam.model');

const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getExamWindow = (exam) => {
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  const windows = scheduleRows
    .map((slot) => {
      const startDate = toValidDate(slot?.startDate);
      const endDate = toValidDate(slot?.endDate);
      if (!startDate || !endDate) {
        return null;
      }

      return { startDate, endDate };
    })
    .filter(Boolean);

  if (windows.length > 0) {
    return {
      startDate: new Date(Math.min(...windows.map((item) => item.startDate.getTime()))),
      endDate: new Date(Math.max(...windows.map((item) => item.endDate.getTime())))
    };
  }

  const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
  const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;
  if (!fallbackStartDate || !fallbackEndDate) {
    return null;
  }

  return {
    startDate: fallbackStartDate,
    endDate: fallbackEndDate
  };
};

const getUpcomingExamValue = (exams = []) => {
  const nowMs = Date.now();

  const examWindows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const examWindow = getExamWindow(item);
      if (!examWindow) {
        return null;
      }

      const examName = String(item?.examName || item?.description || 'Exam').trim();
      return {
        name: examName || 'Exam',
        startDate: examWindow.startDate,
        endDate: examWindow.endDate
      };
    })
    .filter(Boolean);

  const ongoingExam = examWindows
    .filter((item) => nowMs >= item.startDate.getTime() && nowMs <= item.endDate.getTime())
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  if (ongoingExam) {
    return 'Ongoing';
  }

  const nextScheduledExam = examWindows
    .filter((item) => item.startDate.getTime() > nowMs)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  return nextScheduledExam?.name || 'No Upcoming Exam';
};

const getUtcDayStart = (value = new Date()) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const getDashboardSummary = asyncHandler(async (_req, res) => {
  const today = getUtcDayStart();

  const [
    studentCount,
    teacherCount,
    classCount,
    attendanceAverageRows,
    todayAttendanceTotal,
    todayAttendancePresent,
    exams
  ] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    ClassModel.countDocuments(),
    Student.aggregate([
      {
        $group: {
          _id: null,
          averageAttendance: { $avg: '$attendance' }
        }
      }
    ]),
    Attendance.countDocuments({ date: today }),
    Attendance.countDocuments({ date: today, status: 'Present' }),
    Exam.find({})
      .select('examName description startDate endDate schedule.startDate schedule.endDate')
      .sort({ startDate: 1, createdAt: -1 })
      .limit(50)
      .lean()
  ]);

  const attendanceAverage = Number(attendanceAverageRows?.[0]?.averageAttendance || 0);

  return res.json({
    success: true,
    data: {
      studentsCount: studentCount,
      teachersCount: teacherCount,
      classesCount: classCount,
      upcomingExam: getUpcomingExamValue(exams),
      attendanceSummary: {
        averagePercent: Number(attendanceAverage.toFixed(2)),
        today: {
          total: todayAttendanceTotal,
          present: todayAttendancePresent,
          absent: Math.max(todayAttendanceTotal - todayAttendancePresent, 0)
        }
      }
    }
  });
});

module.exports = {
  getDashboardSummary
};
