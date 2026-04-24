'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/ui/button';
import { get, getBlob, post } from '@/lib/api';
import { SCHOOL_NAME, SCHOOL_UPI_ID, SCHOOL_UPI_PAYEE_NAME } from '@/lib/school-config';
import { getToken } from '@/lib/session';
import { buildUpiPaymentLink } from '@/lib/upi-payment';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Administration',
    title: 'Fees',
    description: 'Process cash or direct online records, and verify student static-QR screenshot submissions.',
    summary: {
      totalDue: 'Total Due',
      totalPaid: 'Total Paid',
      totalPending: 'Total Pending',
      pendingVerifications: 'Pending Verifications',
      filtered: 'Filtered'
    },
    process: {
      title: 'Process Payments',
      subtitle: 'Record cash or direct online confirmations. Use the queue below only for student-uploaded static QR screenshots.',
      searchLabel: 'Search Student (ID / Name)',
      searchPlaceholder: 'Type student ID or name',
      selectedPrefix: 'Selected',
      multipleFound: 'Multiple students found',
      searchExactHint: 'Type exact Student ID or full name.',
      noStudentFound: 'No student found for this search.',
      searchToSelectHint: 'Type Student ID or Name to select a student.',
      autoAllocation: 'Auto Allocation',
      oldestPendingFrom: 'Oldest pending starts from',
      noPendingMonth: 'No pending month for selected student',
      selectSingleStudentHint: 'Select a single student by exact ID or full name',
      searchFirstHint: 'Search student first',
      paymentMode: 'Payment Mode',
      cash: 'Via Cash',
      onlineDirect: 'Online (Direct Record)',
      amount: 'Payment Amount',
      amountPlaceholder: 'Enter amount',
      payNow: 'Pay Now',
      payNowHint: 'Enter amount and open Pay Now to generate QR for this cash collection.',
      transactionRef: 'Transaction Reference (optional)',
      transactionRefPlaceholder: 'UPI reference',
      qrTitle: 'Static QR Code (Reference)',
      downloadQr: 'Download QR',
      qrHint: 'For in-person collection, confirm payment and record it directly. Screenshot upload is not required here.',
      paymentPageTitle: 'Cash Payment QR',
      paymentPageSubtitle: 'Show this QR for the entered amount, collect payment, then close and process cash record.',
      paymentSteps: '1. Show this QR to payer. 2. Confirm payment for the exact amount. 3. Close this page. 4. Click process cash payment.',
      dynamicQrTitle: 'Dynamic Amount QR',
      dynamicQrLoading: 'Generating QR...',
      dynamicQrPlaceholder: 'QR will appear here.',
      referenceLabel: 'Reference',
      upiIdLabel: 'UPI ID',
      closePaymentPage: 'Close Payment Page',
      processing: 'Processing...',
      processCash: 'Process Cash Payment',
      processOnline: 'Record Online Payment'
    },
    verification: {
      title: 'Static QR Verification Queue',
      subtitle: 'Review uploaded screenshots, then approve or reject payment verification.',
      table: {
        studentId: 'Student ID',
        student: 'Student',
        class: 'Class',
        section: 'Section',
        amount: 'Amount',
        submittedAt: 'Submitted At',
        status: 'Status',
        pendingStatus: 'Pending'
      },
      viewScreenshot: 'View Screenshot',
      approve: 'Approve',
      reject: 'Reject'
    },
    alerts: {
      searchExactError: 'Search with exact Student ID or full name to select a student.',
      noPendingError: 'No pending monthly fee found for this student.',
      invalidAmountError: 'Enter a valid payment amount greater than 0.',
      enterAmountFirstError: 'Enter payment amount first.',
      amountExceedError: 'Amount cannot exceed total pending',
      upiConfigError: 'UPI payment is not configured right now.',
      dynamicQrError: 'Unable to generate payment QR right now.',
      dynamicQrNotReadyError: 'Dynamic QR is not ready yet.',
      cashSuccess: 'Cash payment processed and auto-allocated successfully.',
      onlineSuccess: 'Online payment recorded and auto-allocated successfully.',
      verifySuccess: 'Payment approved successfully.',
      rejectSuccess: 'Payment rejected successfully.',
      loadError: 'Failed to load fee data',
      screenshotError: 'Failed to view screenshot',
      pendingScreenshotHint: 'Payment screenshot pending verification. Please verify before processing payment.'
    },
    status: {
      partiallyPaid: 'PARTIALLY PAID',
      pending: 'PENDING'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'ফি',
    description: 'নগদ বা সরাসরি অনলাইন রেকর্ড প্রক্রিয়া করুন এবং শিক্ষার্থীর স্ট্যাটিক-QR স্ক্রিনশট জমা যাচাই করুন।',
    summary: {
      totalDue: 'মোট বকেয়া',
      totalPaid: 'মোট পরিশোধিত',
      totalPending: 'মোট অবশিষ্ট',
      pendingVerifications: 'যাচাই বকেয়া',
      filtered: 'ফিল্টারকৃত'
    },
    process: {
      title: 'পেমেন্ট প্রক্রিয়া করুন',
      subtitle: 'নগদ বা সরাসরি অনলাইন নিশ্চিতকরণ রেকর্ড করুন। শিক্ষার্থীদের আপলোড করা স্ট্যাটিক QR স্ক্রিনশটগুলোর জন্য নিচের কিউ ব্যবহার করুন।',
      searchLabel: 'শিক্ষার্থী খুঁজুন (আইডি / নাম)',
      searchPlaceholder: 'শিক্ষার্থী আইডি বা নাম লিখুন',
      selectedPrefix: 'নির্বাচিত',
      multipleFound: 'একাধিক শিক্ষার্থী পাওয়া গেছে',
      searchExactHint: 'সঠিক শিক্ষার্থী আইডি বা পুরো নাম লিখুন।',
      noStudentFound: 'এই সার্চের জন্য কোনো শিক্ষার্থী পাওয়া যায়নি।',
      searchToSelectHint: 'শিক্ষার্থী নির্বাচন করতে আইডি বা নাম লিখুন।',
      autoAllocation: 'স্বয়ংক্রিয় বরাদ্দ',
      oldestPendingFrom: 'সবচেয়ে পুরোনো বকেয়া শুরু হয়েছে',
      noPendingMonth: 'নির্বাচিত শিক্ষার্থীর জন্য কোনো বকেয়া মাস নেই',
      selectSingleStudentHint: 'সঠিক আইডি বা পুরো নাম দিয়ে একজন শিক্ষার্থী নির্বাচন করুন',
      searchFirstHint: 'প্রথমে শিক্ষার্থী খুঁজুন',
      paymentMode: 'পেমেন্টের ধরন',
      cash: 'নগদ মাধ্যমে',
      onlineDirect: 'অনলাইন (সরাসরি রেকর্ড)',
      amount: 'পেমেন্টের পরিমাণ',
      amountPlaceholder: 'পরিমাণ লিখুন',
      payNow: 'এখন পে করুন',
      payNowHint: 'পরিমাণ লিখে Pay Now খুলুন, এই নগদ সংগ্রহের জন্য QR তৈরি হবে।',
      transactionRef: 'ট্রানজ্যাকশন রেফারেন্স (ঐচ্ছিক)',
      transactionRefPlaceholder: 'UPI রেফারেন্স',
      qrTitle: 'স্ট্যাটিক QR কোড (রেফারেন্স)',
      downloadQr: 'QR ডাউনলোড করুন',
      qrHint: 'সরাসরি কালেকশনের ক্ষেত্রে পেমেন্ট নিশ্চিত করে সরাসরি রেকর্ড করুন। এখানে স্ক্রিনশট আপলোড করার প্রয়োজন নেই।',
      paymentPageTitle: 'নগদ পেমেন্ট QR',
      paymentPageSubtitle: 'লিখিত পরিমাণের জন্য এই QR দেখিয়ে পেমেন্ট নিন, তারপর বন্ধ করে নগদ রেকর্ড করুন।',
      paymentSteps: '১. পেমেন্টকারীর কাছে এই QR দেখান। ২. নির্দিষ্ট পরিমাণের পেমেন্ট নিশ্চিত করুন। ৩. এই পেজ বন্ধ করুন। ৪. নগদ পেমেন্ট প্রক্রিয়া করুন।',
      dynamicQrTitle: 'ডায়নামিক পরিমাণ QR',
      dynamicQrLoading: 'QR তৈরি হচ্ছে...',
      dynamicQrPlaceholder: 'QR এখানে দেখাবে।',
      referenceLabel: 'রেফারেন্স',
      upiIdLabel: 'UPI আইডি',
      closePaymentPage: 'পেমেন্ট পেজ বন্ধ করুন',
      processing: 'প্রক্রিয়া হচ্ছে...',
      processCash: 'নগদ পেমেন্ট প্রক্রিয়া করুন',
      processOnline: 'অনলাইন পেমেন্ট রেকর্ড করুন'
    },
    verification: {
      title: 'স্ট্যাটিক QR যাচাই কিউ',
      subtitle: 'আপলোড করা স্ক্রিনশটগুলো পর্যালোচনা করুন, তারপর পেমেন্ট যাচাই অনুমোদন বা প্রত্যাখ্যান করুন।',
      table: {
        studentId: 'শিক্ষার্থী আইডি',
        student: 'শিক্ষার্থী',
        class: 'ক্লাস',
        section: 'সেকশন',
        amount: 'পরিমাণ',
        submittedAt: 'জমা দেওয়ার সময়',
        status: 'অবস্থা',
        pendingStatus: 'বকেয়া'
      },
      viewScreenshot: 'স্ক্রিনশট দেখুন',
      approve: 'অনুমোদন করুন',
      reject: 'প্রত্যাখ্যান করুন'
    },
    alerts: {
      searchExactError: 'শিক্ষার্থী নির্বাচন করতে সঠিক আইডি বা পুরো নাম দিয়ে খুঁজুন।',
      noPendingError: 'এই শিক্ষার্থীর জন্য কোনো বকেয়া মাসিক ফি পাওয়া যায়নি।',
      invalidAmountError: '০-এর বেশি সঠিক পেমেন্টের পরিমাণ লিখুন।',
      enterAmountFirstError: 'প্রথমে পেমেন্টের পরিমাণ লিখুন।',
      amountExceedError: 'পরিমাণ মোট বকেয়ার বেশি হতে পারবে না',
      upiConfigError: 'এখন UPI পেমেন্ট কনফিগার করা নেই।',
      dynamicQrError: 'এখন পেমেন্ট QR তৈরি করা যাচ্ছে না।',
      dynamicQrNotReadyError: 'ডায়নামিক QR এখনও প্রস্তুত নয়।',
      cashSuccess: 'নগদ পেমেন্ট সফলভাবে প্রক্রিয়া এবং বরাদ্দ করা হয়েছে।',
      onlineSuccess: 'অনলাইন পেমেন্ট সফলভাবে রেকর্ড এবং বরাদ্দ করা হয়েছে।',
      verifySuccess: 'পেমেন্ট সফলভাবে অনুমোদন করা হয়েছে।',
      rejectSuccess: 'পেমেন্ট সফলভাবে প্রত্যাখ্যান করা হয়েছে।',
      loadError: 'ফি তথ্য লোড করতে ব্যর্থ হয়েছে',
      screenshotError: 'স্ক্রিনশট দেখতে ব্যর্থ হয়েছে',
      pendingScreenshotHint: 'পেমেন্ট স্ক্রিনশট যাচাইকরণ অপেক্ষমান। পেমেন্ট প্রসেস করার আগে এটি যাচাই করুন।'
    },
    status: {
      partiallyPaid: 'আংশিক পরিশোধিত',
      pending: 'বকেয়া'
    }
  }
};


const PENDING_SCREENSHOT_VERIFICATION_MESSAGE = 'Payment screenshot pending verification. Please verify before processing payment.';
const FALLBACK_UPI_ID = 'alfazali499-1@okicici';
const ADMIN_UPI_REFERENCE_PREFIX = 'DMCAFEE';

const normalizeStatus = (status, t) => {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PARTIALLY_PAID') {
    return t.status.partiallyPaid;
  }
  if (value === 'PENDING') {
      return t.status.pending;
  }
  return value || t.status.pending;
};

const formatMonth = (dateValue, language) => {
  if (!dateValue) {
    return '-';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return String(dateValue).slice(0, 7);
  }

  return date.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', { month: 'long', year: 'numeric' });
};

const filterStudentsBySearch = (items, searchText) => {
  const query = String(searchText || '').trim().toLowerCase();
  if (!query) {
    return items;
  }

  const exactIdMatches = items.filter((item) => String(item.admissionNo || '').toLowerCase() === query);
  if (exactIdMatches.length > 0) {
    return exactIdMatches;
  }

  return items.filter((item) => {
    const studentName = String(item.userId?.name || '').toLowerCase();
    return studentName.includes(query);
  });
};

const filterVerificationRows = (items, searchText) => {
  const query = String(searchText || '').trim().toLowerCase();
  if (!query) {
    return items;
  }

  const exactIdMatches = items.filter((item) => String(item.studentId?.admissionNo || '').toLowerCase() === query);
  if (exactIdMatches.length > 0) {
    return exactIdMatches;
  }

  return items.filter((item) => String(item.studentId?.userId?.name || '').toLowerCase().includes(query));
};

const toReferenceToken = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const buildAdminUpiReference = (studentIdentifier = '') => {
  const normalizedStudentToken = toReferenceToken(studentIdentifier);
  if (!normalizedStudentToken) {
    return `${ADMIN_UPI_REFERENCE_PREFIX}STUDENT`;
  }

  return `${ADMIN_UPI_REFERENCE_PREFIX}${normalizedStudentToken}`.slice(0, 35);
};

const downloadDataUrlAsPng = ({ dataUrl, fileName }) => {
  if (!dataUrl || typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadQrAsJpeg = () => {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 512;
    canvas.height = img.height || 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'payment-qr-code.jpeg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/jpeg', 0.95);
  };
  img.src = '/static-payment-qr.svg';
};

export default function AdminFeesPage() {
  const toast = useToast();
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const verificationColumns = [
    { key: 'studentAdmissionNo', label: t.verification.table.studentId },
    { key: 'studentName', label: t.verification.table.student },
    { key: 'className', label: t.verification.table.class },
    { key: 'section', label: t.verification.table.section },
    { key: 'amount', label: t.verification.table.amount },
    { key: 'submittedAt', label: t.verification.table.submittedAt },
    { key: 'status', label: t.verification.table.status }
  ];

  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [studentSearch, setStudentSearch] = useState('');
  const [verificationSearch, setVerificationSearch] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
  const [debouncedVerificationSearch, setDebouncedVerificationSearch] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [amount, setAmount] = useState('');
  const [payNowModalOpen, setPayNowModalOpen] = useState(false);
  const [dynamicQrDataUrl, setDynamicQrDataUrl] = useState('');
  const [dynamicQrLoading, setDynamicQrLoading] = useState(false);

  const configuredUpiId = String(SCHOOL_UPI_ID || '').trim() || FALLBACK_UPI_ID;
  const configuredPayeeName = String(SCHOOL_UPI_PAYEE_NAME || SCHOOL_NAME || 'School Payment').trim() || 'School Payment';

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message, toast]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedStudentSearch(studentSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [studentSearch]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedVerificationSearch(verificationSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [verificationSearch]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const token = getToken();
      const [feesRes, studentsRes, verificationRes] = await Promise.all([
        get('/fees', token),
        get('/students', token),
        get('/fees/pending-verifications', token)
      ]);

      const feeRows = (feesRes.data || []).map((item) => {
        const pending = Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0);
        return {
          id: item._id,
          studentId: item.studentId?._id,
          studentAdmissionNo: item.studentId?.admissionNo || '-',
          studentName: item.studentId?.userId?.name || item.studentId?._id,
          amountDueValue: item.amountDue || 0,
          amountPaidValue: item.amountPaid || 0,
          pendingAmountValue: pending,
          month: formatMonth(item.dueDate, language),
          amountDue: `INR ${item.amountDue || 0}`,
          amountPaid: `INR ${item.amountPaid || 0}`,
          status: normalizeStatus(item.status, t),
          dueDate: item.dueDate?.slice(0, 10)
        };
      }).filter((item) => item.amountDueValue > 0 || item.amountPaidValue > 0).sort((a, b) => {
        const first = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const second = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return first - second;
      });

      setRows(feeRows);
      setStudents(studentsRes.data || []);
      setPendingVerifications(verificationRes.data || []);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData().catch((apiError) => {
      setError(apiError.message || t.alerts.loadError);
      setRows([]);
    });
  }, []);

  const filteredStudents = useMemo(
    () => filterStudentsBySearch(students, debouncedStudentSearch),
    [debouncedStudentSearch, students]
  );

  const selectedStudent = useMemo(() => {
    const query = String(debouncedStudentSearch || '').trim().toLowerCase();
    if (!query) {
      return null;
    }

    const exactIdMatch = students.find((item) => String(item.admissionNo || '').toLowerCase() === query);
    if (exactIdMatch) {
      return exactIdMatch;
    }

    const exactNameMatches = students.filter((item) => String(item.userId?.name || '').toLowerCase() === query);
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }

    if (filteredStudents.length === 1) {
      return filteredStudents[0];
    }

    return null;
  }, [debouncedStudentSearch, filteredStudents, students]);

  const selectedStudentId = String(selectedStudent?._id || '');

  const filteredPendingVerifications = useMemo(
    () => filterVerificationRows(pendingVerifications, debouncedVerificationSearch),
    [debouncedVerificationSearch, pendingVerifications]
  );

  const selectedStudentRows = useMemo(
    () => rows.filter((row) => row.studentId === selectedStudentId),
    [rows, selectedStudentId]
  );

  const oldestPendingFee = useMemo(
    () => selectedStudentRows.find((row) => row.pendingAmountValue > 0) || null,
    [selectedStudentRows]
  );

  const selectedStudentPendingTotal = useMemo(
    () => selectedStudentRows.reduce((sum, row) => sum + (row.pendingAmountValue || 0), 0),
    [selectedStudentRows]
  );

  const hasEnteredAmount = String(amount || '').trim().length > 0;
  const enteredAmount = Number(amount || 0);
  const isEnteredAmountValid = Number.isFinite(enteredAmount) && enteredAmount > 0 && enteredAmount <= selectedStudentPendingTotal;
  const payNowAmount = isEnteredAmountValid ? enteredAmount : 0;

  const resolvedUpiReference = useMemo(
    () => buildAdminUpiReference(selectedStudent?.admissionNo || selectedStudent?._id || ''),
    [selectedStudent?._id, selectedStudent?.admissionNo]
  );

  const upiPaymentLink = useMemo(() => {
    if (!selectedStudentId || !isEnteredAmountValid) {
      return '';
    }

    return buildUpiPaymentLink({
      upiId: configuredUpiId,
      payeeName: configuredPayeeName,
      amount: payNowAmount,
      transactionReference: resolvedUpiReference,
      note: `Admin Cash Fee Collection ${resolvedUpiReference ? `(${resolvedUpiReference})` : ''}`.trim()
    });
  }, [configuredPayeeName, configuredUpiId, isEnteredAmountValid, payNowAmount, resolvedUpiReference, selectedStudentId]);

  const canOpenPayNow = paymentMode === 'CASH' && Boolean(oldestPendingFee) && hasEnteredAmount && isEnteredAmountValid && Boolean(upiPaymentLink);

  const feeSummary = useMemo(() => {
    const totalDue = rows.reduce((sum, row) => sum + Number(row.amountDueValue || 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amountPaidValue || 0), 0);
    const totalPending = rows.reduce((sum, row) => sum + Number(row.pendingAmountValue || 0), 0);

    return {
      totalDue,
      totalPaid,
      totalPending,
      pendingVerificationCount: pendingVerifications.length,
      filteredVerificationCount: filteredPendingVerifications.length
    };
  }, [filteredPendingVerifications.length, pendingVerifications.length, rows]);

  useEffect(() => {
    if (paymentMode !== 'CASH') {
      setPayNowModalOpen(false);
    }
  }, [paymentMode]);

  useEffect(() => {
    if (!payNowModalOpen || typeof window === 'undefined') {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPayNowModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payNowModalOpen]);

  useEffect(() => {
    let isDisposed = false;

    if (!payNowModalOpen || !upiPaymentLink) {
      setDynamicQrDataUrl('');
      setDynamicQrLoading(false);
      return undefined;
    }

    const generateDynamicQr = async () => {
      setDynamicQrLoading(true);
      try {
        const qrDataUrl = await QRCode.toDataURL(upiPaymentLink, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 360
        });
        if (!isDisposed) {
          setDynamicQrDataUrl(qrDataUrl);
        }
      } catch (qrError) {
        if (!isDisposed) {
          setDynamicQrDataUrl('');
          setError(qrError?.message || t.alerts.dynamicQrError);
        }
      } finally {
        if (!isDisposed) {
          setDynamicQrLoading(false);
        }
      }
    };

    generateDynamicQr();

    return () => {
      isDisposed = true;
    };
  }, [payNowModalOpen, t.alerts.dynamicQrError, upiPaymentLink]);

  const closePayNowModal = () => {
    setPayNowModalOpen(false);
  };

  const onOpenPayNow = () => {
    setError('');
    setMessage('');

    if (!selectedStudentId) {
      setError(t.alerts.searchExactError);
      return;
    }

    if (!oldestPendingFee) {
      setError(t.alerts.noPendingError);
      return;
    }

    if (!hasEnteredAmount) {
      setError(t.alerts.enterAmountFirstError);
      return;
    }

    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
      setError(t.alerts.invalidAmountError);
      return;
    }

    if (!isEnteredAmountValid) {
      setError(`${t.alerts.amountExceedError} INR ${selectedStudentPendingTotal}.`);
      return;
    }

    if (!upiPaymentLink) {
      setError(t.alerts.upiConfigError);
      return;
    }

    setPayNowModalOpen(true);
  };

  const onDownloadDynamicQr = () => {
    if (!dynamicQrDataUrl) {
      setError(t.alerts.dynamicQrNotReadyError);
      return;
    }

    const referenceToken = toReferenceToken(resolvedUpiReference) || 'PAYMENT';
    downloadDataUrlAsPng({
      dataUrl: dynamicQrDataUrl,
      fileName: `admin-cash-upi-qr-${referenceToken}.png`
    });
  };

  const onProcessPayment = async (event) => {
    event.preventDefault();
    if (!selectedStudentId) {
      setError(t.alerts.searchExactError);
      return;
    }

    if (!oldestPendingFee) {
      setError(t.alerts.noPendingError);
      return;
    }

    const amountToProcess = Number(amount || selectedStudentPendingTotal);
    if (!Number.isFinite(amountToProcess) || amountToProcess <= 0) {
      setError(t.alerts.invalidAmountError);
      return;
    }

    if (amountToProcess > selectedStudentPendingTotal) {
      setError(`${t.alerts.amountExceedError} INR ${selectedStudentPendingTotal}.`);
      return;
    }

    setSubmittingCash(true);
    setError('');
    setMessage('');

    try {
      if (paymentMode === 'CASH') {
        await post(`/fees/${oldestPendingFee.id}/pay-cash`, { amount: amountToProcess }, getToken());
        setMessage(t.alerts.cashSuccess);
      } else {
        await post(
          `/fees/${oldestPendingFee.id}/pay-online`,
          {
            amount: amountToProcess,
            transactionReference: transactionReference.trim() || undefined
          },
          getToken()
        );
        setMessage(t.alerts.onlineSuccess);
        setTransactionReference('');
      }

      setAmount('');
      setPayNowModalOpen(false);
      setDynamicQrDataUrl('');
      await loadData();
    } catch (apiError) {
      if ((apiError.rawMessage || apiError.message) === 'Payment screenshot pending verification. Please verify before processing payment.') {
        toast.info(t.alerts.pendingScreenshotHint);
        return;
      }
      setError(apiError.message);
    } finally {
      setSubmittingCash(false);
    }
  };

  const onVerify = async (paymentId, decision) => {
    setError('');
    setMessage('');
    try {
      await post(`/fees/payments/${paymentId}/verify`, { decision }, getToken());
      setMessage(decision === 'APPROVE' ? t.alerts.verifySuccess : t.alerts.rejectSuccess);
      await loadData();
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const onViewScreenshot = async (paymentId) => {
    setError('');
    try {
      const blob = await getBlob(`/fees/payments/${paymentId}/screenshot`, getToken());
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">{t.summary.totalDue}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalDue}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">{t.summary.totalPaid}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalPaid}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">{t.summary.totalPending}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalPending}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">{t.summary.pendingVerifications}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">{feeSummary.pendingVerificationCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-red-100/75">{t.summary.filtered}: {feeSummary.filteredVerificationCount}</p>
        </div>
      </section>

      <form
        onSubmit={onProcessPayment}
        className="rounded-3xl border border-red-100/85 bg-white/85 p-5 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-red-50">{t.process.title}</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-red-100/80">{t.process.subtitle}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t.process.searchLabel}
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="h-11"
            placeholder={t.process.searchPlaceholder}
            required
          />

          <div className="rounded-xl border border-red-100 bg-red-50/65 px-3 py-2 text-sm text-slate-700 dark:border-red-400/20 dark:bg-red-900/20 dark:text-red-100">
            {selectedStudent
              ? `${t.process.selectedPrefix}: ${selectedStudent.userId?.name || (language === 'bn' ? 'শিক্ষার্থী' : 'Student')} (${selectedStudent.admissionNo || '-'})`
              : studentSearch.trim()
                ? filteredStudents.length > 1
                  ? `${t.process.multipleFound} (${filteredStudents.length}). ${t.process.searchExactHint}`
                  : t.process.noStudentFound
                : t.process.searchToSelectHint}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-red-100">{t.process.autoAllocation}</label>
            <div className="h-11 rounded-xl border border-red-200 bg-red-50/60 px-3 text-sm leading-[44px] text-slate-700 dark:border-red-400/30 dark:bg-red-900/20 dark:text-red-100">
              {oldestPendingFee
                ? `${t.process.oldestPendingFrom} ${oldestPendingFee.month}`
                : studentSearch.trim()
                  ? selectedStudent
                    ? t.process.noPendingMonth
                    : t.process.selectSingleStudentHint
                  : t.process.searchFirstHint}
            </div>
          </div>

          <Select
            label={t.process.paymentMode}
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value)}
            options={[
              { value: 'CASH', label: t.process.cash },
              { value: 'ONLINE', label: t.process.onlineDirect }
            ]}
            required
          />

          <Input
            label={t.process.amount}
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11"
            placeholder={selectedStudentId ? String(selectedStudentPendingTotal || 0) : t.process.amountPlaceholder}
          />

          {paymentMode === 'CASH' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 dark:border-emerald-400/30 dark:bg-emerald-900/20">
              <p className="text-xs text-emerald-900 dark:text-emerald-100/90">{t.process.payNowHint}</p>
              <button
                type="button"
                onClick={onOpenPayNow}
                disabled={!canOpenPayNow}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t.process.payNow}
              </button>
              {hasEnteredAmount && !isEnteredAmountValid ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                  {Number.isFinite(enteredAmount) && enteredAmount > 0
                    ? `${t.alerts.amountExceedError} INR ${selectedStudentPendingTotal}.`
                    : t.alerts.invalidAmountError}
                </p>
              ) : null}
            </div>
          )}

          {paymentMode === 'ONLINE' && (
            <Input
              label={t.process.transactionRef}
              value={transactionReference}
              onChange={(event) => setTransactionReference(event.target.value)}
              className="h-11"
              placeholder={t.process.transactionRefPlaceholder}
            />
          )}
        </div>

        {paymentMode === 'ONLINE' && (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-400/20 dark:bg-red-900/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 dark:text-red-100">{t.process.qrTitle}</p>
              <button
                type="button"
                onClick={downloadQrAsJpeg}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100 dark:hover:bg-slate-700"
              >
                {t.process.downloadQr}
              </button>
            </div>
            <Image
              src="/static-payment-qr.svg"
              alt="Static payment QR"
              width={192}
              height={192}
              className="mt-3 h-48 w-48 rounded-xl border border-red-100 bg-white p-2 dark:border-red-400/20 dark:bg-slate-900/80"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-red-100/75">{t.process.qrHint}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={submittingCash || !oldestPendingFee}
          className="mt-4"
          size="md"
        >
          {submittingCash ? t.process.processing : paymentMode === 'CASH' ? t.process.processCash : t.process.processOnline}
        </Button>
      </form>

      {payNowModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
          onClick={closePayNowModal}
          role="dialog"
          aria-modal="true"
          aria-label={t.process.paymentPageTitle}
        >
          <div
            className="h-[80vh] w-[80vw] overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl dark:border-red-400/20 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-red-100 px-4 py-3 sm:px-6 dark:border-red-400/20">
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-red-50">{t.process.paymentPageTitle}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-red-100/75">{t.process.paymentPageSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={closePayNowModal}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100 dark:hover:bg-slate-700"
              >
                {t.process.closePaymentPage}
              </button>
            </div>

            <div className="grid h-[calc(80vh-70px)] gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(240px,320px)_1fr] md:p-6">
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 dark:border-red-400/20 dark:bg-red-900/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-red-100">{t.process.dynamicQrTitle}</p>
                  <button
                    type="button"
                    onClick={onDownloadDynamicQr}
                    disabled={!dynamicQrDataUrl || dynamicQrLoading}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100 dark:hover:bg-slate-700"
                  >
                    {t.process.downloadQr}
                  </button>
                </div>
                <div className="mt-3 flex h-64 w-full items-center justify-center rounded-lg border border-red-100 bg-white p-3 dark:border-red-400/20 dark:bg-slate-900/80">
                  {dynamicQrLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-red-100/80">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-red-200/30 dark:border-t-red-100" />
                      <p className="text-xs">{t.process.dynamicQrLoading}</p>
                    </div>
                  ) : dynamicQrDataUrl ? (
                    <img
                      src={dynamicQrDataUrl}
                      alt="Dynamic payment QR"
                      className="h-full w-full max-w-[260px] rounded-md object-contain"
                    />
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-red-100/75">{t.process.dynamicQrPlaceholder}</p>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-700 dark:text-red-100">
                  <p>
                    {t.process.amount}: <span className="font-semibold">INR {payNowAmount.toFixed(2)}</span>
                  </p>
                  <p>
                    {t.process.referenceLabel}: <span className="font-semibold">{resolvedUpiReference || '-'}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-red-100 bg-white p-4 dark:border-red-400/20 dark:bg-slate-900/80">
                <p className="text-sm font-semibold text-slate-900 dark:text-red-50">{t.process.processCash}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-red-100/80">
                  {t.process.paymentSteps}
                </p>

                <div className="mt-4 rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-slate-700 dark:border-red-400/20 dark:bg-red-900/20 dark:text-red-100">
                  <p>
                    {t.process.upiIdLabel}: <span className="font-semibold">{configuredUpiId}</span>
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button
                    type="button"
                    onClick={closePayNowModal}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100 dark:hover:bg-slate-700"
                  >
                    {t.process.closePaymentPage}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-red-100/85 bg-white/85 p-5 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-red-50">{t.verification.title}</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-red-100/80">{t.verification.subtitle}</p>

        <Input
          label={t.process.searchLabel}
          value={verificationSearch}
          onChange={(event) => setVerificationSearch(event.target.value)}
          className="h-11"
          placeholder={t.process.searchPlaceholder}
        />

        <Table
          columns={verificationColumns}
          loading={loadingData}
          scrollY
          maxHeightClass="max-h-[288px]"
          virtualize
          virtualizationThreshold={40}
          virtualHeight={288}
          rows={filteredPendingVerifications.map((item) => ({
            id: item._id,
            studentAdmissionNo: item.studentId?.admissionNo || '-',
            studentName: item.studentId?.userId?.name || '-',
            className: item.studentId?.classId?.name || '-',
            section: item.studentId?.classId?.section || '-',
            amount: `INR ${item.amount || 0}`,
            submittedAt: new Date(item.createdAt).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB'),
            status: t.verification.table.pendingStatus
          }))}
        />

        {filteredPendingVerifications.length > 0 && (
          <div className="mt-4 space-y-2">
            {filteredPendingVerifications.map((item) => (
              <div key={item._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 dark:border-red-400/20 dark:bg-red-900/15">
                <p className="text-sm text-slate-700 dark:text-red-100">
                  {item.studentId?.admissionNo || '-'} - {item.studentId?.userId?.name || (language === 'bn' ? 'শিক্ষার্থী' : 'Student')} - INR {item.amount}
                </p>
                <Button
                  type="button"
                  onClick={() => onViewScreenshot(item._id)}
                  variant="outline"
                  size="sm"
                >
                  {t.verification.viewScreenshot}
                </Button>
                <Button
                  type="button"
                  onClick={() => onVerify(item._id, 'APPROVE')}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {t.verification.approve}
                </Button>
                <Button
                  type="button"
                  onClick={() => onVerify(item._id, 'REJECT')}
                  variant="danger"
                  size="sm"
                >
                  {t.verification.reject}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}