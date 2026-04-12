'use client';

import { useEffect, useMemo, useState } from 'react';
import Input from '@/components/Input';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/button';
import { del, get, patch, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Administration',
    title: 'Notice Management',
    description: 'Create notices for students, teachers, or everyone, mark important updates, and collect notice-specific payments.',
    form: {
      editTitle: 'Update Notice',
      createTitle: 'Create Notice',
      saving: 'Saving...',
      clear: 'Clear',
      labels: {
        title: 'Title',
        type: 'Notice Type',
        audience: 'Audience',
        description: 'Description',
        targetClasses: 'Target Classes',
        targetTeacherClasses: 'Target Teacher Classes',
        allClasses: 'All Classes',
        allTeachers: 'All Teachers',
        amount: 'Amount',
        dueDate: 'Due Date',
        status: 'Status',
        important: 'Mark as important notice'
      },
      placeholders: {
        description: 'Write a short notice description',
        statusHint: 'New notices are created as Active by default. Use the expire action later when needed.'
      },
      types: {
        General: 'General',
        Payment: 'Payment',
        paymentStudentOnly: 'Payment (Students only)'
      },
      roles: {
        student: 'Students',
        teacher: 'Teachers',
        all: 'All'
      },
      classesHint: {
        all: 'This notice will be sent to all students and teachers. Class selection is not required.',
        teacherPrefix: 'Leave class selection empty (All Teachers checked) to publish to every teacher.',
        studentPrefix: 'Leave class selection empty (All Classes checked) to publish to every class.'
      }
    },
    list: {
      title: 'Published Notices',
      subtitle: 'Review, edit, expire, publish, or delete notices.',
      table: {
        title: 'Title',
        audience: 'Audience',
        type: 'Type',
        classes: 'Classes',
        amount: 'Amount',
        dueDate: 'Due Date',
        important: 'Important',
        status: 'Status',
        actions: 'Actions'
      },
      loading: 'Loading notices...',
      noNotices: 'No notices found.',
      actions: {
        edit: 'Edit',
        expire: 'Expire',
        publish: 'Publish',
        delete: 'Delete'
      },
      importantValues: {
         yes: 'Yes',
         no: 'No'
      }
    },
    cashRecord: {
      title: 'Record Notice Payment by Cash (Admin)',
      subtitle: 'Use this when a student pays notice amount at the admin desk in cash.',
      labels: {
        paymentNotice: 'Payment Notice',
        student: 'Student',
        cashRef: 'Cash Reference (optional)',
        selectedAmount: 'Selected Notice Amount',
        notes: 'Notes (optional)'
      },
      placeholders: {
        selectNotice: 'Select payment notice',
        selectStudent: 'Select student',
        selectNoticeFirst: 'Select payment notice first',
        loadingStudents: 'Loading students...',
        noStudentsFound: 'No students found for selected notice classes',
        cashRef: 'Receipt no / voucher no',
        notes: 'Optional note for this cash collection'
      },
      recording: 'Recording...',
      recordBtn: 'Record Cash Payment',
      clear: 'Clear'
    },
    verification: {
      title: 'Notice Payment Verification Queue',
      subtitle: 'Approve or reject screenshots submitted for payment-related notices.',
      table: {
        notice: 'Notice',
        student: 'Student',
        amount: 'Amount',
        submittedAt: 'Submitted At',
        reference: 'Reference',
        status: 'Status',
        screenshot: 'Screenshot',
        actions: 'Actions'
      },
      loading: 'Loading payment submissions...',
      noPending: 'No pending notice payments.',
      actions: {
         view: 'View',
         notAvailable: 'Not available',
         approve: 'Approve',
         reject: 'Reject'
      }
    },
    history: {
      title: 'Notice Payment History',
      subtitle: 'All notice payment records including verified, pending, and rejected statuses.',
      table: {
        notice: 'Notice',
        student: 'Student',
        amount: 'Amount',
        paymentDate: 'Payment Date',
        status: 'Status',
        reference: 'Reference',
        verifiedAt: 'Verified At',
        verifiedBy: 'Verified By',
        notes: 'Notes',
        screenshot: 'Screenshot'
      },
      loading: 'Loading payment history...',
      noHistory: 'No notice payment history found.'
    },
    labels: {
       allTeachers: 'All Teachers',
       allClasses: 'All Classes',
       class: 'Class'
    },
    alerts: {
       titleDescReq: 'Title and description are required',
       amountReq: 'Amount is required for payment notices',
       studentOnly: 'Payment notices can only be issued to students',
       saveSuccess: 'Notice created successfully',
       updateSuccess: 'Notice updated successfully',
       saveError: 'Failed to save notice',
       deleteConfirm: 'Delete this notice?',
       deleteSuccess: 'Notice deleted successfully',
       deleteError: 'Failed to delete notice',
       expireSuccess: 'Notice marked as expired',
       expireError: 'Failed to expire notice',
       publishSuccess: 'Notice published successfully',
       publishError: 'Failed to publish notice',
       verifySuccess: 'Notice payment verified',
       rejectSuccess: 'Notice payment rejected',
       verifyError: 'Failed to update notice payment verification',
       selectBothError: 'Select both notice and student',
       invalidAmountError: 'Selected notice amount is invalid',
       cashSuccess: 'Cash notice payment recorded successfully',
       cashError: 'Failed to record cash notice payment',
       loadClassesError: 'Failed to load classes',
       loadNoticesError: 'Failed to load notices',
       loadPendingError: 'Failed to load pending notice payments',
       loadHistoryError: 'Failed to load notice payment history',
       loadStudentsError: 'Failed to load students',
       loadNoticeRecordsError: 'Failed to load notice payment records'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'নোটিশ ব্যবস্থাপনা',
    description: 'শিক্ষার্থী, শিক্ষক বা সবার জন্য নোটিশ তৈরি করুন, গুরুত্বপূর্ণ আপডেট চিহ্নিত করুন এবং নোটিশ-ভিত্তিক পেমেন্ট সংগ্রহ করুন।',
    form: {
      editTitle: 'নোটিশ আপডেট করুন',
      createTitle: 'নোটিশ তৈরি করুন',
      saving: 'সংরক্ষণ হচ্ছে...',
      clear: 'মুছে ফেলুন',
      labels: {
        title: 'শিরোনাম',
        type: 'নোটিশের ধরন',
        audience: 'দর্শক',
        description: 'বিবরণ',
        targetClasses: 'লক্ষ্যস্থ ক্লাস',
        targetTeacherClasses: 'শিক্ষকের ক্লাস সমূহ',
        allClasses: 'সব ক্লাস',
        allTeachers: 'সব শিক্ষক',
        amount: 'পরিমাণ',
        dueDate: 'শেষ তারিখ',
        status: 'অবস্থা',
        important: 'গুরুত্বপূর্ণ নোটিশ হিসেবে চিহ্নিত করুন'
      },
      placeholders: {
        description: 'নোটিশের একটি সংক্ষিপ্ত বিবরণ লিখুন',
        statusHint: 'নতুন নোটিশগুলো ডিফল্টভাবে "Active" হিসেবে তৈরি হয়। প্রয়োজনে পরে "Expire" অ্যাকশন ব্যবহার করুন।'
      },
      types: {
        General: 'সাধারণ',
        Payment: 'পেমেন্ট',
        paymentStudentOnly: 'পেমেন্ট (শুধুমাত্র শিক্ষার্থীদের জন্য)'
      },
      roles: {
        student: 'শিক্ষার্থী',
        teacher: 'শিক্ষক',
        all: 'সবাই'
      },
      classesHint: {
        all: 'এই নোটিশটি সব শিক্ষার্থী এবং শিক্ষকদের কাছে পাঠানো হবে। ক্লাস নির্বাচনের প্রয়োজন নেই।',
        teacherPrefix: 'সব শিক্ষকের কাছে পাঠাতে ক্লাস নির্বাচন খালি রাখুন (সব শিক্ষক টিক দিন)।',
        studentPrefix: 'সব ক্লাসের কাছে পাঠাতে ক্লাস নির্বাচন খালি রাখুন (সব ক্লাস টিক দিন)।'
      }
    },
    list: {
      title: 'প্রকাশিত নোটিশসমূহ',
      subtitle: 'নোটিশগুলো পর্যালোচনা করুন, আপডেট করুন, শেষ করুন, প্রকাশ করুন বা মুছে ফেলুন।',
      table: {
        title: 'শিরোনাম',
        audience: 'দর্শক',
        type: 'ধরন',
        classes: 'ক্লাসসমূহ',
        amount: 'পরিমাণ',
        dueDate: 'শেষ তারিখ',
        important: 'গুরুত্বপূর্ণ',
        status: 'অবস্থা',
        actions: 'অ্যাকশন'
      },
      loading: 'নোটিশ লোড হচ্ছে...',
      noNotices: 'কোনো নোটিশ পাওয়া যায়নি।',
      actions: {
        edit: 'সম্পাদনা',
        expire: 'শেষ করুন',
        publish: 'প্রকাশ করুন',
        delete: 'মুছুন'
      },
      importantValues: {
         yes: 'হ্যাঁ',
         no: 'না'
      }
    },
    cashRecord: {
      title: 'নগদ মাধ্যমে নোটিশ পেমেন্ট রেকর্ড (অ্যাডমিন)',
      subtitle: 'যখন কোনো শিক্ষার্থী অ্যাডমিন ডেস্কে নগদ টাকা জমা দেয় তখন এটি ব্যবহার করুন।',
      labels: {
        paymentNotice: 'পেমেন্ট নোটিশ',
        student: 'শিক্ষার্থী',
        cashRef: 'নগদ রেফারেন্স (ঐচ্ছিক)',
        selectedAmount: 'নির্বাচিত নোটিশের পরিমাণ',
        notes: 'নোট (ঐচ্ছিক)'
      },
      placeholders: {
        selectNotice: 'পেমেন্ট নোটিশ নির্বাচন করুন',
        selectStudent: 'শিক্ষার্থী নির্বাচন করুন',
        selectNoticeFirst: 'প্রথমে পেমেন্ট নোটিশ নির্বাচন করুন',
        loadingStudents: 'শিক্ষার্থী লোড হচ্ছে...',
        noStudentsFound: 'নির্বাচিত নোটিশের ক্লাসের জন্য কোনো শিক্ষার্থী পাওয়া যায়নি',
        cashRef: 'মানি রিসিট নম্বর / ভাউচার নম্বর',
        notes: 'এই নগদ সংগ্রহের জন্য ঐচ্ছিক নোট'
      },
      recording: 'রেকর্ড হচ্ছে...',
      recordBtn: 'নগদ পেমেন্ট রেকর্ড করুন',
      clear: 'মুছে ফেলুন'
    },
    verification: {
      title: 'নোটিশ পেমেন্ট যাচাই কিউ',
      subtitle: 'পেমেন্ট সংক্রান্ত নোটিশের জন্য জমা দেওয়া স্ক্রিনশটগুলো অনুমোদন বা প্রত্যাখ্যান করুন।',
      table: {
        notice: 'নোটিশ',
        student: 'শিক্ষার্থী',
        amount: 'পরিমাণ',
        submittedAt: 'জমা দেওয়ার সময়',
        reference: 'রেফারেন্স',
        status: 'অবস্থা',
        screenshot: 'স্ক্রিনশট',
        actions: 'অ্যাকশন'
      },
      loading: 'পেমেন্ট জমা লোড হচ্ছে...',
      noPending: 'কোনো অপেক্ষমান নোটিশ পেমেন্ট নেই।',
      actions: {
         view: 'দেখুন',
         notAvailable: 'পাওয়া যায়নি',
         approve: 'অনুমোদন করুন',
         reject: 'প্রত্যাখ্যান করুন'
      }
    },
    history: {
      title: 'নোটিশ পেমেন্ট ইতিহাস',
      subtitle: 'অনুমোদিত, অপেক্ষমান এবং প্রত্যাখ্যাত সকল নোটিশ পেমেন্ট রেকর্ড।',
      table: {
        notice: 'নোটিশ',
        student: 'শিক্ষার্থী',
        amount: 'পরিমাণ',
        paymentDate: 'পেমেন্টের তারিখ',
        status: 'অবস্থা',
        reference: 'রেফারেন্স',
        verifiedAt: 'যাচাই করা হয়েছে',
        verifiedBy: 'যাচাই করেছেন',
        notes: 'নোট',
        screenshot: 'স্ক্রিনশট'
      },
      loading: 'পেমেন্ট ইতিহাস লোড হচ্ছে...',
      noHistory: 'কোনো নোটিশ পেমেন্ট ইতিহাস পাওয়া যায়নি।'
    },
    labels: {
       allTeachers: 'সব শিক্ষক',
       allClasses: 'সব ক্লাস',
       class: 'ক্লাস'
    },
    alerts: {
       titleDescReq: 'শিরোনাম এবং বিবরণ প্রয়োজন',
       amountReq: 'পেমেন্ট নোটিশের জন্য পরিমাণ প্রয়োজন',
       studentOnly: 'পেমেন্ট নোটিশ শুধুমাত্র শিক্ষার্থীদের জন্য দেওয়া যায়',
       saveSuccess: 'নোটিশ সফলভাবে তৈরি করা হয়েছে',
       updateSuccess: 'নোটিশ সফলভাবে আপডেট করা হয়েছে',
       saveError: 'নোটিশ সংরক্ষণ করতে ব্যর্থ হয়েছে',
       deleteConfirm: 'এই নোটিশটি মুছে ফেলতে চান?',
       deleteSuccess: 'নোটিশ সফলভাবে মুছে ফেলা হয়েছে',
       deleteError: 'নোটিশ মুছতে ব্যর্থ হয়েছে',
       expireSuccess: 'নোটিশের মেয়াদ শেষ হিসেবে চিহ্নিত করা হয়েছে',
       expireError: 'নোটিশের মেয়াদ শেষ করতে ব্যর্থ হয়েছে',
       publishSuccess: 'নোটিশ সফলভাবে প্রকাশ করা হয়েছে',
       publishError: 'নোটিশ প্রকাশ করতে ব্যর্থ হয়েছে',
       verifySuccess: 'নোটিশ পেমেন্ট যাচাই করা হয়েছে',
       rejectSuccess: 'নোটিশ পেমেন্ট প্রত্যাখ্যান করা হয়েছে',
       verifyError: 'নোটিশ পেমেন্ট যাচাইকরণ আপডেট করতে ব্যর্থ হয়েছে',
       selectBothError: 'নোটিশ এবং শিক্ষার্থী উভয়ই নির্বাচন করুন',
       invalidAmountError: 'নির্বাচিত নোটিশের পরিমাণ সঠিক নয়',
       cashSuccess: 'নগদ নোটিশ পেমেন্ট সফলভাবে রেকর্ড করা হয়েছে',
       cashError: 'নগদ নোটিশ পেমেন্ট রেকর্ড করতে ব্যর্থ হয়েছে',
       loadClassesError: 'ক্লাস লোড করতে ব্যর্থ হয়েছে',
       loadNoticesError: 'নোটিশ লোড করতে ব্যর্থ হয়েছে',
       loadPendingError: 'অপেক্ষমান নোটিশ পেমেন্ট লোড করতে ব্যর্থ হয়েছে',
       loadHistoryError: 'নোটিশ পেমেন্ট ইতিহাস লোড করতে ব্যর্থ হয়েছে',
       loadStudentsError: 'শিক্ষার্থী লোড করতে ব্যর্থ হয়েছে',
       loadNoticeRecordsError: 'নোটিশ পেমেন্ট রেকর্ড লোড করতে ব্যর্থ হয়েছে'
    }
  }
};

const NOTICE_TYPES = ['General', 'Payment'];
const RECIPIENT_ROLES = [
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'all', label: 'All' }
];

const getInitialForm = () => ({
  title: '',
  description: '',
  recipientRole: 'student',
  classIds: [],
  noticeType: 'General',
  amount: '',
  dueDate: '',
  isImportant: false,
  status: 'Active'
});

const toId = (value) => String(value?._id || value || '');
const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const toDateInputValue = (value) => {
  if (!value) {
    return '';
  }

  const asText = String(value);
  if (asText.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(asText)) {
    return asText.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const formatDateLabel = (value, language) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB');
};

const formatDateTimeLabel = (value, language) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB');
};

const normalizeNoticePaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PAID') {
    return 'VERIFIED';
  }
  if (normalized === 'PENDING') {
    return 'PENDING_VERIFICATION';
  }
  if (['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(normalized)) {
    return normalized;
  }
  return String(status || '').trim();
};

export default function AdminNoticesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const toast = useToast();
  const [form, setForm] = useState(getInitialForm());
  const [editingId, setEditingId] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClassNames, setSelectedClassNames] = useState([]);
  const [selectedClassSections, setSelectedClassSections] = useState({});
  const [students, setStudents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [pendingNoticePayments, setPendingNoticePayments] = useState([]);
  const [noticePaymentHistory, setNoticePaymentHistory] = useState([]);
  const [selectedNoticePayments, setSelectedNoticePayments] = useState([]);
  const [loadingSelectedNoticePayments, setLoadingSelectedNoticePayments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [verifyingPaymentId, setVerifyingPaymentId] = useState('');
  const [recordingCashPayment, setRecordingCashPayment] = useState(false);
  const [cashPaymentForm, setCashPaymentForm] = useState({
    noticeId: '',
    studentId: '',
    transactionReference: '',
    notes: ''
  });

  const paymentNoticeOptions = useMemo(
    () => notices.filter(
      (item) =>
        String(item?.noticeType || '') === 'Payment' &&
        String(item?.status || '') === 'Active' &&
        String(item?.recipientRole || 'student') === 'student'
    ),
    [notices]
  );

  const studentOptions = useMemo(
    () => students.filter((item) => item?.isLinkedRecord && isMongoId(toId(item))),
    [students]
  );

  const selectedCashNotice = useMemo(
    () => paymentNoticeOptions.find((item) => toId(item) === cashPaymentForm.noticeId) || null,
    [cashPaymentForm.noticeId, paymentNoticeOptions]
  );

  const selectedNoticeClassIds = useMemo(() => {
    const ids = Array.isArray(selectedCashNotice?.classIds)
      ? selectedCashNotice.classIds.map((item) => toId(item)).filter(Boolean)
      : [];

    return Array.from(new Set(ids));
  }, [selectedCashNotice]);

  const paidStudentIdsForSelectedNotice = useMemo(() => {
    const paidStudentIds = new Set();
    selectedNoticePayments.forEach((item) => {
      const normalizedStatus = normalizeNoticePaymentStatus(item?.paymentStatus);
      if (normalizedStatus === 'VERIFIED') {
        paidStudentIds.add(toId(item?.studentId));
      }
    });

    return paidStudentIds;
  }, [selectedNoticePayments]);

  const scopedStudentOptions = useMemo(() => {
    if (!selectedCashNotice) {
      return [];
    }

    // Empty classIds means notice is published for all classes.
    if (selectedNoticeClassIds.length === 0) {
      return studentOptions.filter((item) => !paidStudentIdsForSelectedNotice.has(toId(item)));
    }

    const allowedClassIds = new Set(selectedNoticeClassIds);
    return studentOptions.filter((item) => {
      const classId = toId(item?.classId);
      const studentId = toId(item);
      return allowedClassIds.has(classId) && !paidStudentIdsForSelectedNotice.has(studentId);
    });
  }, [selectedCashNotice, selectedNoticeClassIds, studentOptions, paidStudentIdsForSelectedNotice]);

  const classLabelMap = useMemo(
    () => classes.reduce((acc, item) => {
      acc[toId(item)] = formatClassLabel(item, t.labels.class);
      return acc;
    }, {}),
    [classes, t.labels.class]
  );

  const allClassesSelected = form.classIds.length === 0;

  const loadData = async () => {
    setLoading(true);

    try {
      const token = getToken();
      const [classResult, noticeResult, pendingPaymentResult, historyPaymentResult, studentResult] = await Promise.allSettled([
        get('/classes', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/notices?page=1&limit=100', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/notices/payments/pending', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/notices/payments/history?page=1&limit=200', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/students/admin/all', token, { forceRefresh: true, cacheTtlMs: 0 })
      ]);

      if (classResult.status === 'fulfilled') {
        setClasses(Array.isArray(classResult.value?.data) ? classResult.value.data : []);
      } else {
        toast.error(classResult.reason?.message || t.alerts.loadClassesError);
      }

      if (noticeResult.status === 'fulfilled') {
        setNotices(Array.isArray(noticeResult.value?.data) ? noticeResult.value.data : []);
      } else {
        setNotices([]);
        toast.error(noticeResult.reason?.message || t.alerts.loadNoticesError);
      }

      if (pendingPaymentResult.status === 'fulfilled') {
        setPendingNoticePayments(Array.isArray(pendingPaymentResult.value?.data) ? pendingPaymentResult.value.data : []);
      } else {
        setPendingNoticePayments([]);
        toast.error(pendingPaymentResult.reason?.message || t.alerts.loadPendingError);
      }

      if (historyPaymentResult.status === 'fulfilled') {
        setNoticePaymentHistory(Array.isArray(historyPaymentResult.value?.data) ? historyPaymentResult.value.data : []);
      } else {
        setNoticePaymentHistory([]);
        toast.error(historyPaymentResult.reason?.message || t.alerts.loadHistoryError);
      }

      if (studentResult.status === 'fulfilled') {
        setStudents(Array.isArray(studentResult.value?.data) ? studentResult.value.data : []);
      } else {
        setStudents([]);
        toast.error(studentResult.reason?.message || t.alerts.loadStudentsError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const noticeId = String(cashPaymentForm.noticeId || '').trim();
    if (!noticeId) {
      setSelectedNoticePayments([]);
      setLoadingSelectedNoticePayments(false);
      return;
    }

    let cancelled = false;

    const loadNoticePayments = async () => {
      setLoadingSelectedNoticePayments(true);
      try {
        const response = await get(`/notices/payments/by-notice?noticeId=${noticeId}`, getToken(), {
          forceRefresh: true,
          cacheTtlMs: 0
        });

        if (!cancelled) {
          setSelectedNoticePayments(Array.isArray(response?.data) ? response.data : []);
        }
      } catch (apiError) {
        if (!cancelled) {
          setSelectedNoticePayments([]);
          toast.error(apiError.message || 'Failed to load notice payment records');
        }
      } finally {
        if (!cancelled) {
          setLoadingSelectedNoticePayments(false);
        }
      }
    };

    loadNoticePayments();

    return () => {
      cancelled = true;
    };
  }, [cashPaymentForm.noticeId, toast]);

  useEffect(() => {
    const selectedStudentId = String(cashPaymentForm.studentId || '').trim();
    if (!selectedStudentId) {
      return;
    }

    const isStillValid = scopedStudentOptions.some((item) => toId(item) === selectedStudentId);
    if (!isStillValid) {
      setCashPaymentForm((prev) => ({
        ...prev,
        studentId: ''
      }));
    }
  }, [cashPaymentForm.studentId, scopedStudentOptions]);

  const resetForm = () => {
    setForm(getInitialForm());
    setEditingId('');
  };

  const onFieldChange = (field) => (event) => {
    const nextValue = event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value;

    setForm((prev) => {
      if (field === 'noticeType') {
        const nextType = String(nextValue || 'General');
        return {
          ...prev,
          noticeType: nextType,
          amount: nextType === 'Payment' ? prev.amount : '',
          dueDate: nextType === 'Payment' ? prev.dueDate : ''
        };
      }

      if (field === 'recipientRole') {
        const nextRecipientRole = String(nextValue || 'student');
        const enforceGeneralType = nextRecipientRole !== 'student' && prev.noticeType === 'Payment';

        return {
          ...prev,
          recipientRole: nextRecipientRole,
          classIds: nextRecipientRole === 'all' ? [] : prev.classIds,
          noticeType: enforceGeneralType ? 'General' : prev.noticeType,
          amount: enforceGeneralType ? '' : prev.amount,
          dueDate: enforceGeneralType ? '' : prev.dueDate
        };
      }

      return {
        ...prev,
        [field]: nextValue
      };
    });
  };

  const onToggleAllClasses = (event) => {
    const checked = Boolean(event.target.checked);

    setForm((prev) => ({
      ...prev,
      classIds: checked
        ? []
        : classes.length > 0
          ? [toId(classes[0])]
          : []
    }));
  };

  const onToggleClass = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists
        ? prev.classIds.filter((item) => item !== classId)
        : [...prev.classIds, classId];

      return {
        ...prev,
        classIds: nextClassIds
      };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    const title = String(form.title || '').trim();
    const description = String(form.description || '').trim();
    const amount = Number(form.amount || 0);

    if (!title || !description) {
      toast.error(t.alerts.titleDescReq);
      return;
    }

    if (form.noticeType === 'Payment' && (!Number.isFinite(amount) || amount <= 0)) {
      toast.error(t.alerts.amountReq);
      return;
    }

    if (form.recipientRole !== 'student' && form.noticeType === 'Payment') {
      toast.error(t.alerts.studentOnly);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title,
        description,
        recipientRole: form.recipientRole,
        classIds: form.recipientRole === 'all' ? [] : form.classIds,
        noticeType: form.noticeType,
        amount: form.noticeType === 'Payment' ? amount : undefined,
        dueDate: form.noticeType === 'Payment' && form.dueDate ? form.dueDate : undefined,
        isImportant: Boolean(form.isImportant),
        status: editingId ? form.status : undefined
      };

      if (editingId) {
        await put(`/notices/${editingId}`, payload, getToken());
      } else {
        await post('/notices', payload, getToken());
      }

      toast.success(editingId ? t.alerts.updateSuccess : t.alerts.saveSuccess);
      resetForm();
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.saveError);
    } finally {
      setSaving(false);
    }
  };

  const onEditNotice = (notice) => {
    const nextRecipientRole = String(notice?.recipientRole || 'student');
    const nextNoticeType = String(notice?.noticeType || 'General');

    setEditingId(toId(notice));
    setForm({
      title: String(notice?.title || ''),
      description: String(notice?.description || ''),
      recipientRole: nextRecipientRole,
      classIds: nextRecipientRole === 'all'
        ? []
        : Array.isArray(notice?.classIds)
        ? notice.classIds.map((item) => toId(item)).filter(Boolean)
        : [],
      noticeType: nextRecipientRole !== 'student' && nextNoticeType === 'Payment' ? 'General' : nextNoticeType,
      amount: notice?.amount !== undefined && notice?.amount !== null ? String(notice.amount) : '',
      dueDate: toDateInputValue(notice?.dueDate),
      isImportant: Boolean(notice?.isImportant),
      status: String(notice?.status || 'Active')
    });
  };

  const onDeleteNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    const confirmed = await toast.confirm(t.alerts.deleteConfirm, {
      confirmLabel: t.list.actions.delete,
      cancelLabel: t.form.clear,
      destructive: true
    });
    if (!confirmed) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await del(`/notices/${noticeId}`, getToken());
      toast.success(t.alerts.deleteSuccess);

      if (editingId === noticeId) {
        resetForm();
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.deleteError);
    } finally {
      setProcessingId('');
    }
  };

  const onExpireNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await patch(`/notices/expire/${noticeId}`, {}, getToken());
      toast.success(t.alerts.expireSuccess);

      if (editingId === noticeId) {
        setForm((prev) => ({ ...prev, status: 'Expired' }));
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.expireError);
    } finally {
      setProcessingId('');
    }
  };

  const onPublishNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await put(`/notices/${noticeId}`, { status: 'Active' }, getToken());
      toast.success(t.alerts.publishSuccess);

      if (editingId === noticeId) {
        setForm((prev) => ({ ...prev, status: 'Active' }));
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.publishError);
    } finally {
      setProcessingId('');
    }
  };

  const onVerifyNoticePayment = async (paymentId, decision) => {
    if (!paymentId) {
      return;
    }

    const notes = '';

    setVerifyingPaymentId(paymentId);
    try {
      await post(`/notices/payments/${paymentId}/verify`, {
        decision,
        notes: String(notes).trim()
      }, getToken());

      toast.success(decision === 'APPROVE' ? t.alerts.verifySuccess : t.alerts.rejectSuccess);
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.verifyError);
    } finally {
      setVerifyingPaymentId('');
    }
  };

  const onCashPaymentFieldChange = (field) => (event) => {
    const nextValue = String(event.target.value || '');
    setCashPaymentForm((prev) => ({
      ...prev,
      [field]: nextValue,
      ...(field === 'noticeId' ? { studentId: '' } : {})
    }));
  };

  const resetCashPaymentForm = () => {
    setCashPaymentForm({
      noticeId: '',
      studentId: '',
      transactionReference: '',
      notes: ''
    });
  };

  const onRecordCashNoticePayment = async (event) => {
    event.preventDefault();

    const noticeId = String(cashPaymentForm.noticeId || '').trim();
    const studentId = String(cashPaymentForm.studentId || '').trim();
    if (!noticeId || !studentId) {
      toast.error(t.alerts.selectBothError);
      return;
    }

    const selectedNoticeAmount = Number(selectedCashNotice?.amount || 0);
    if (!selectedNoticeAmount || selectedNoticeAmount <= 0) {
      toast.error(t.alerts.invalidAmountError);
      return;
    }

    setRecordingCashPayment(true);
    try {
      await post('/notices/payments/cash', {
        noticeId,
        studentId,
        amount: selectedNoticeAmount,
        transactionReference: String(cashPaymentForm.transactionReference || '').trim() || undefined,
        notes: String(cashPaymentForm.notes || '').trim() || undefined
      }, getToken());

      toast.success(t.alerts.cashSuccess);
      resetCashPaymentForm();
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.cashError);
    } finally {
      setRecordingCashPayment(false);
    }
  };

  const getClassLabelForNotice = (notice) => {
    const ids = Array.isArray(notice?.classIds)
      ? notice.classIds.map((item) => toId(item)).filter(Boolean)
      : [];
    const recipientRole = String(notice?.recipientRole || 'student');
    const isTeacherNotice = recipientRole === 'teacher';

    if (recipientRole === 'all') {
      return '-';
    }

    if (ids.length === 0) {
      return isTeacherNotice ? t.labels.allTeachers : t.labels.allClasses;
    }

    return ids.map((id) => classLabelMap[id] || t.labels.class).join(', ');
  };

  const getStatusBadgeClassName = (status) => {
    const normalized = normalizeNoticePaymentStatus(status);
    if (normalized === 'VERIFIED') {
      return 'bg-emerald-100 text-emerald-800';
    }
    if (normalized === 'PENDING_VERIFICATION') {
      return 'bg-amber-100 text-amber-800';
    }
    if (normalized === 'REJECTED') {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <form
        onSubmit={onSubmit}
        className="rounded-3xl border border-red-100/85 bg-white/85 p-4 shadow-[0_28px_60px_-36px_rgba(153,27,27,0.7)] backdrop-blur-xl md:p-5 dark:border-red-400/20 dark:bg-slate-900/75"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label={t.form.labels.title}
            value={form.title}
            onChange={onFieldChange('title')}
            required
            disabled={saving}
          />

          <div className="mb-3 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.form.labels.type}</span>
            <select
              value={form.noticeType}
              onChange={onFieldChange('noticeType')}
              disabled={saving}
              className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
            >
              {NOTICE_TYPES.map((item) => {
                const disabled = form.recipientRole !== 'student' && item === 'Payment';
                return (
                  <option key={item} value={item} disabled={disabled}>
                    {disabled ? t.form.types.paymentStudentOnly : (t.form.types[item] || item)}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-3 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.form.labels.audience}</span>
            <select
              value={form.recipientRole}
              onChange={onFieldChange('recipientRole')}
              disabled={saving}
              className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
            >
              {RECIPIENT_ROLES.map((item) => (
                <option key={item.value} value={item.value}>{t.form.roles[item.value] || item.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.form.labels.description}</span>
          <textarea
            value={form.description}
            onChange={onFieldChange('description')}
            disabled={saving}
            rows={3}
            className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
            placeholder={t.form.placeholders.description}
            required
          />
        </label>

        {form.recipientRole === 'all' ? (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-slate-600 dark:border-red-400/20 dark:bg-red-900/20 dark:text-red-100/80">
            {t.form.classesHint.all}
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50/50 px-3 py-3 dark:border-red-400/20 dark:bg-red-900/20">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 dark:text-red-100">
                {form.recipientRole === 'teacher' ? t.form.labels.targetTeacherClasses : t.form.labels.targetClasses}
              </p>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-red-100">
                <input
                  type="checkbox"
                  checked={allClassesSelected}
                  onChange={onToggleAllClasses}
                  disabled={saving}
                  className="h-4 w-4"
                />
                {form.recipientRole === 'teacher' ? t.form.labels.allTeachers : t.form.labels.allClasses}
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {classes.map((classItem) => {
                const classId = toId(classItem);
                const checked = form.classIds.includes(classId);

                return (
                  <label key={classId} className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-slate-700 dark:border-red-400/20 dark:bg-slate-900/75 dark:text-red-100">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleClass(classId)}
                      disabled={saving}
                      className="h-4 w-4"
                    />
                    <span>{formatClassLabel(classItem, t.labels.class)}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-red-100/75">
              {form.recipientRole === 'teacher'
                ? t.form.classesHint.teacherPrefix
                : t.form.classesHint.studentPrefix}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {form.noticeType === 'Payment' ? (
            <>
              <Input
                label={t.form.labels.amount}
                type="number"
                min="1"
                value={form.amount}
                onChange={onFieldChange('amount')}
                required
                disabled={saving}
              />
              <Input
                label={t.form.labels.dueDate}
                type="date"
                value={form.dueDate}
                onChange={onFieldChange('dueDate')}
                disabled={saving}
              />
            </>
          ) : null}

          {editingId ? (
            <div className="mb-3 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.form.labels.status}</span>
              <select
                value={form.status}
                onChange={onFieldChange('status')}
                disabled={saving}
                className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
              >
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          ) : (
            <div className="mb-3 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-slate-600 dark:border-red-400/20 dark:bg-red-900/20 dark:text-red-100/75 md:col-span-3">
              {t.form.placeholders.statusHint}
            </div>
          )}
        </div>

        <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-red-100">
          <input
            type="checkbox"
            checked={Boolean(form.isImportant)}
            onChange={onFieldChange('isImportant')}
            disabled={saving}
            className="h-4 w-4"
          />
          {t.form.labels.important}
        </label>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? t.form.saving : editingId ? t.form.editTitle : t.form.createTitle}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetForm}
            disabled={saving}
          >
            {t.form.clear}
          </Button>
        </div>
      </form>

      <section className="rounded-3xl border border-red-100/85 bg-white/85 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="border-b border-red-100 px-4 py-3 md:px-5 dark:border-red-400/20">
          <h2 className="text-base font-semibold text-slate-900 dark:text-red-50">{t.list.title}</h2>
          <p className="text-xs text-slate-600 dark:text-red-100/80">{t.list.subtitle}</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-red-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.title}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.audience}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.type}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.classes}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.amount}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.dueDate}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.important}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.status}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.list.table.actions}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">{t.list.loading}</td>
                </tr>
              ) : notices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">{t.list.noNotices}</td>
                </tr>
              ) : notices.map((notice, rowIndex) => {
                const noticeId = toId(notice);
                const isRowBusy = processingId === noticeId;
                const isActive = String(notice?.status || '') === 'Active';
                const recipientRole = String(notice?.recipientRole || 'student');

                return (
                  <tr key={noticeId} className={rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{notice?.title || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">{notice?.description || '-'}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {t.form.roles[recipientRole] || recipientRole}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">{t.form.types[notice?.noticeType] || notice?.noticeType || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{getClassLabelForNotice(notice)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {notice?.noticeType === 'Payment' ? `INR ${notice?.amount || 0}` : '-'}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateLabel(notice?.dueDate, language)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{notice?.isImportant ? t.list.importantValues.yes : t.list.importantValues.no}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{notice?.status || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onEditNotice(notice)}
                          disabled={isRowBusy}
                          className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {t.list.actions.edit}
                        </button>

                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => onExpireNotice(notice)}
                            disabled={isRowBusy}
                            className="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {t.list.actions.expire}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onPublishNotice(notice)}
                            disabled={isRowBusy}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {t.list.actions.publish}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteNotice(notice)}
                          disabled={isRowBusy}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {t.list.actions.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-red-100/85 bg-white/85 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="border-b border-red-100 px-4 py-3 md:px-5 dark:border-red-400/20">
          <h2 className="text-base font-semibold text-slate-900 dark:text-red-50">{t.cashRecord.title}</h2>
          <p className="text-xs text-slate-600 dark:text-red-100/80">{t.cashRecord.subtitle}</p>
        </div>

        <form onSubmit={onRecordCashNoticePayment} className="space-y-3 px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="mb-1 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.cashRecord.labels.paymentNotice}</span>
              <select
                value={cashPaymentForm.noticeId}
                onChange={onCashPaymentFieldChange('noticeId')}
                disabled={loading || recordingCashPayment}
                className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
              >
                <option value="">{t.cashRecord.placeholders.selectNotice}</option>
                {paymentNoticeOptions.map((notice) => (
                  <option key={toId(notice)} value={toId(notice)}>
                    {`${notice?.title || t.cashRecord.labels.paymentNotice} | ${getClassLabelForNotice(notice)} | INR ${Number(notice?.amount || 0)} | Due ${formatDateLabel(notice?.dueDate, language)}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-1 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.cashRecord.labels.student}</span>
              <select
                value={cashPaymentForm.studentId}
                onChange={onCashPaymentFieldChange('studentId')}
                disabled={loading || recordingCashPayment || loadingSelectedNoticePayments || !cashPaymentForm.noticeId}
                className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
              >
                <option value="">
                  {!cashPaymentForm.noticeId
                    ? t.cashRecord.placeholders.selectNoticeFirst
                    : loadingSelectedNoticePayments
                      ? t.cashRecord.placeholders.loadingStudents
                      : t.cashRecord.placeholders.selectStudent}
                </option>
                {scopedStudentOptions.map((student) => (
                  <option key={toId(student)} value={toId(student)}>
                    {`${student?.userId?.name || '-'} | ID ${student?.admissionNo || '-'} | ${formatClassLabel(student?.classId, t.labels.class)}`}
                  </option>
                ))}
                {cashPaymentForm.noticeId && !loadingSelectedNoticePayments && scopedStudentOptions.length === 0 ? (
                  <option value="" disabled>{t.cashRecord.placeholders.noStudentsFound}</option>
                ) : null}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label={t.cashRecord.labels.cashRef}
              value={cashPaymentForm.transactionReference}
              onChange={onCashPaymentFieldChange('transactionReference')}
              disabled={loading || recordingCashPayment}
              placeholder={t.cashRecord.placeholders.cashRef}
            />

            <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 dark:border-red-400/20 dark:bg-red-900/20">
              <p className="text-xs font-semibold text-slate-600 dark:text-red-100/80">{t.cashRecord.labels.selectedAmount}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-red-50">
                {selectedCashNotice ? `INR ${Number(selectedCashNotice?.amount || 0)}` : '-'}
              </p>
            </div>
          </div>

          <label className="mb-1 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{t.cashRecord.labels.notes}</span>
            <textarea
              value={cashPaymentForm.notes}
              onChange={onCashPaymentFieldChange('notes')}
              disabled={loading || recordingCashPayment}
              rows={2}
              placeholder={t.cashRecord.placeholders.notes}
              className="w-full rounded-xl border border-red-200 bg-white/90 px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-4 focus:ring-red-100 dark:border-red-400/35 dark:bg-slate-900/75 dark:text-red-50 dark:focus:ring-red-500/20"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={loading || recordingCashPayment || loadingSelectedNoticePayments}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {recordingCashPayment ? t.cashRecord.recording : t.cashRecord.recordBtn}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetCashPaymentForm}
              disabled={loading || recordingCashPayment}
            >
              {t.cashRecord.clear}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-red-100/85 bg-white/85 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="border-b border-red-100 px-4 py-3 md:px-5 dark:border-red-400/20">
          <h2 className="text-base font-semibold text-slate-900 dark:text-red-50">{t.verification.title}</h2>
          <p className="text-xs text-slate-600 dark:text-red-100/80">{t.verification.subtitle}</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-red-900 via-red-700 to-red-900 text-red-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.notice}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.student}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.amount}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.submittedAt}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.reference}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.status}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.screenshot}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.verification.table.actions}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">{t.verification.loading}</td>
                </tr>
              ) : pendingNoticePayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">{t.verification.noPending}</td>
                </tr>
              ) : pendingNoticePayments.map((payment, rowIndex) => {
                const paymentId = toId(payment);
                const isRowBusy = verifyingPaymentId === paymentId;
                const student = payment?.studentId || {};
                const studentUser = student?.userId || {};
                const classInfo = student?.classId || {};
                const status = normalizeNoticePaymentStatus(payment?.paymentStatus);
                const screenshotPath = String(payment?.screenshotPath || '').trim();

                return (
                  <tr key={paymentId} className={rowIndex % 2 === 1 ? 'bg-amber-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{payment?.noticeId?.title || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">{t.form.labels.dueDate}: {formatDateLabel(payment?.noticeId?.dueDate, language)}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{studentUser?.name || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">ID: {student?.admissionNo || '-'} | {t.labels.class}: {formatClassLabel(classInfo, t.labels.class)}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">INR {Number(payment?.amount || 0)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateTimeLabel(payment?.paymentDate || payment?.createdAt, language)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{payment?.transactionReference || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{status || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {screenshotPath ? (
                        <a
                          href={screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                        >
                          {t.verification.actions.view}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">{t.verification.actions.notAvailable}</span>
                      )}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onVerifyNoticePayment(paymentId, 'APPROVE')}
                          disabled={isRowBusy}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {t.verification.actions.approve}
                        </button>
                        <button
                          type="button"
                          onClick={() => onVerifyNoticePayment(paymentId, 'REJECT')}
                          disabled={isRowBusy}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {t.verification.actions.reject}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-red-100/85 bg-white/85 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="border-b border-red-100 px-4 py-3 md:px-5 dark:border-red-400/20">
          <h2 className="text-base font-semibold text-slate-900 dark:text-red-50">{t.history.title}</h2>
          <p className="text-xs text-slate-600 dark:text-red-100/80">{t.history.subtitle}</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1300px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-red-900 via-red-700 to-red-900 text-red-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.notice}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.student}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.amount}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.paymentDate}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.status}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.reference}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.verifiedAt}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.verifiedBy}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.notes}</th>
                <th className="px-3 py-3 text-left font-semibold">{t.history.table.screenshot}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">{t.history.loading}</td>
                </tr>
              ) : noticePaymentHistory.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">{t.history.noHistory}</td>
                </tr>
              ) : noticePaymentHistory.map((payment, rowIndex) => {
                const paymentId = toId(payment);
                const student = payment?.studentId || {};
                const studentUser = student?.userId || {};
                const classInfo = student?.classId || {};
                const verifiedBy = payment?.verifiedBy || {};
                const status = normalizeNoticePaymentStatus(payment?.paymentStatus);
                const screenshotPath = String(payment?.screenshotPath || '').trim();

                return (
                  <tr key={paymentId} className={rowIndex % 2 === 1 ? 'bg-blue-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{payment?.noticeId?.title || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">{t.form.labels.dueDate}: {formatDateLabel(payment?.noticeId?.dueDate, language)}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{studentUser?.name || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">ID: {student?.admissionNo || '-'} | {t.labels.class}: {formatClassLabel(classInfo, t.labels.class)}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">INR {Number(payment?.amount || 0)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateTimeLabel(payment?.paymentDate || payment?.createdAt, language)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(status)}`}>
                        {status || '-'}
                      </span>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">{payment?.transactionReference || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateTimeLabel(payment?.verifiedAt, language)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{verifiedBy?.name || verifiedBy?.email || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{payment?.verificationNotes || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {screenshotPath ? (
                        <a
                          href={screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                        >
                          {t.verification.actions.view}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">{t.verification.actions.notAvailable}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
