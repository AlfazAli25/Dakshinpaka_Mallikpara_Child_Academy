'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Administration',
    title: 'Exam Management',
    description: 'Create meaningful class-wise exam plans with subject-level schedule and clear date-time slots.',
    createPlan: 'Create Exam Plan',
    editPlan: 'Edit Exam Plan',
    planSubtitle: 'Plan each selected class with exact subject exam start and end date-time.',
    form: {
      examName: 'Exam Name',
      examType: 'Exam Type',
      academicYear: 'Academic Year',
      fee: 'Admit Card Fee Amount (INR)',
      selectClass: 'Select Class',
      allClasses: 'All Classes',
      lockedHint: 'Class selection is locked while editing an existing exam. Create a new record for other classes.',
      schedule: 'Class-Subject Exam Schedule',
      scheduleSubtitle: 'Pick subjects and set exact start/end date-time for each subject exam.',
      noClasses: 'Select one or more classes to begin class-wise subject scheduling.',
      copyTiming: 'Copy First Timing To All',
      noSubjects: 'No subjects found for this class.',
      examDate: 'Exam Date',
      startTime: 'Start Time',
      endTime: 'End Time',
      enableSubject: 'Enable subject to set its exam schedule.',
      plannedSlots: 'Planned slots',
      description: 'Description',
      descriptionPlaceholder: 'Optional note about exam structure, invigilator plan, or extra instructions',
      save: 'Create Exam',
      update: 'Update Exam',
      saving: 'Saving...',
      cancelEdit: 'Cancel Edit'
    },
    search: {
      title: 'Search Exam',
      placeholder: 'Type exam name',
      filter: 'Filter by Class',
      allClasses: 'All classes'
    },
    table: {
      columns: {
        examName: 'Exam Name',
        className: 'Class',
        section: 'Section',
        subjects: 'Subject Schedule',
        examWindow: 'Exam Window',
        academicYear: 'Academic Year',
        actions: 'Actions'
      },
      subjectSlots: 'subject slot',
      subjectSlotsPlural: 'subject slots',
      moreSlots: 'more slot(s)',
      admitCards: 'Admit Cards',
      edit: 'Edit',
      delete: 'Delete'
    },
    pagination: {
      prefix: 'Page',
      mid: 'of',
      total: 'Total records',
      prev: 'Previous',
      next: 'Next'
    },
    delete: {
      title: 'Delete Exam',
      textPrefix: 'This action will permanently delete',
      cancel: 'Cancel',
      delete: 'Delete',
      deleting: 'Deleting...'
    },
    alerts: {
      loadSetupError: 'Failed to initialize exam management',
      loadExamsError: 'Failed to load exams',
      updateSuccess: 'Exam updated successfully',
      createSuccess: 'Exam created successfully',
      multiCreateSuccessPrefix: 'Exams created for',
      multiCreateSuccessSuffix: 'classes',
      duplicateError: 'Exam already exists for selected class(es)',
      createError: 'Failed to create exams',
      skippedPrefix: 'Some classes were skipped',
      genericError: 'Failed to save exam',
      deleteSuccess: 'Exam deleted successfully',
      deleteError: 'Failed to delete exam',
      nameReq: 'Exam name is required',
      classReq: 'Select at least one class',
      editModeClassReq: 'Edit mode supports one class at a time',
      yearReq: 'Academic year is required',
      yearFormat: 'Academic year must be in YYYY format',
      feeError: 'Admit card fee amount must be 0 or more',
      subjectReq: 'Select at least one subject for',
      slotDetailsReq: 'Set date, start time, and end time for',
      pastDateError: 'Exam date cannot be in the past for',
      invalidSchedule: 'Invalid schedule date or time for',
      timeOrderError: 'End time must be after start time for',
      overlapError: 'Two subjects in the class cannot be scheduled at the same time',
      examExists: 'Exam already exists'
    },
    examTypes: {
      unitTest: 'Unit Test',
      finalExam: 'Final Exam'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'পরীক্ষা ব্যবস্থাপনা',
    description: 'বিষয়ভিত্তিক সময়সূচী এবং নির্দিষ্ট তারিখ-সময় সম্বলিত অর্থপূর্ণ ক্লাস-ভিত্তিক পরীক্ষার পরিকল্পনা তৈরি করুন।',
    createPlan: 'পরীক্ষার পরিকল্পনা তৈরি করুন',
    editPlan: 'পরীক্ষার পরিকল্পনা সম্পাদনা করুন',
    planSubtitle: 'প্রতিটি নির্বাচিত ক্লাসের জন্য বিষয়ের পরীক্ষার শুরুর এবং শেষ তারিখ-সময় পরিকল্পনা করুন।',
    form: {
      examName: 'পরীক্ষায় নাম',
      examType: 'পরীক্ষার ধরন',
      academicYear: 'শিক্ষাবর্ষ',
      fee: 'অ্যাডমিট কার্ড ফি (টাকা)',
      selectClass: 'ক্লাস নির্বাচন করুন',
      allClasses: 'সব ক্লাস',
      lockedHint: 'বিদ্যমান পরীক্ষা সম্পাদনার সময় ক্লাস পরিবর্তন করা যাবে না। অন্য ক্লাসের জন্য নতুন রেকর্ড তৈরি করুন।',
      schedule: 'ক্লাস-বিষয় পরীক্ষার সময়সূচী',
      scheduleSubtitle: 'বিষয় বেছে নিন এবং প্রতিটি বিষয়ের পরীক্ষার জন্য সঠিক শুরুর ও শেষের তারিখ-সময় সেট করুন।',
      noClasses: 'ক্লাস-ভিত্তিক বিষয় পরীক্ষার সময়সূচী শুরু করতে এক বা একাধিক ক্লাস নির্বাচন করুন।',
      copyTiming: 'প্রথম সময়টি সবগুলোতে কপি করুন',
      noSubjects: 'এই ক্লাসের জন্য কোনো বিষয় পাওয়া যায়নি।',
      examDate: 'পরীক্ষার তারিখ',
      startTime: 'শুরুর সময়',
      endTime: 'শেষের সময়',
      enableSubject: 'পরীক্ষার সময়সূচী সেট করতে বিষয়টি চালু করুন।',
      plannedSlots: 'পরিকল্পিত স্লট',
      description: 'বিবরণ',
      descriptionPlaceholder: 'পরীক্ষার কাঠামো, পরিদর্শক পরিকল্পনা বা অতিরিক্ত নির্দেশনা সম্পর্কে ঐচ্ছিক নোট',
      save: 'পরীক্ষা তৈরি করুন',
      update: 'পরীক্ষা আপডেট করুন',
      saving: 'সংরক্ষণ হচ্ছে...',
      cancelEdit: 'সম্পাদনা বাতিল'
    },
    search: {
      title: 'পরীক্ষা খুঁজুন',
      placeholder: 'পরীক্ষার নাম লিখুন',
      filter: 'ক্লাস অনুযায়ী দেখুন',
      allClasses: 'সব ক্লাস'
    },
    table: {
      columns: {
        examName: 'পরীক্ষায় নাম',
        className: 'ক্লাস',
        section: 'সেকশন',
        subjects: 'বিষয় সময়সূচী',
        examWindow: 'পরীক্ষার সময়কাল',
        academicYear: 'শিক্ষাবর্ষ',
        actions: 'অ্যাকশন'
      },
      subjectSlots: 'টি বিষয়ের স্লট',
      subjectSlotsPlural: 'টি বিষয়ের স্লট',
      moreSlots: 'আরও স্লট',
      admitCards: 'অ্যাডমিট কার্ড',
      edit: 'সম্পাদনা',
      delete: 'মুছুন'
    },
    pagination: {
      prefix: 'পৃষ্ঠা',
      mid: 'এর',
      total: 'মোট রেকর্ড',
      prev: 'পূর্ববর্তী',
      next: 'পরবর্তী'
    },
    delete: {
      title: 'পরীক্ষা মুছে ফেলুন',
      textPrefix: 'এই কাজটি স্থায়ীভাবে মুছে ফেলবে:',
      cancel: 'বাতিল',
      delete: 'মুছুন',
      deleting: 'মুছে ফেলা হচ্ছে...'
    },
    alerts: {
      loadSetupError: 'পরীক্ষা ব্যবস্থাপনা শুরু করতে ব্যর্থ হয়েছে',
      loadExamsError: 'পরীক্ষা লোড করতে ব্যর্থ হয়েছে',
      updateSuccess: 'পরীক্ষা সফলভাবে আপডেট করা হয়েছে',
      createSuccess: 'পরীক্ষা সফলভাবে তৈরি করা হয়েছে',
      multiCreateSuccessPrefix: '',
      multiCreateSuccessSuffix: 'টি ক্লাসের জন্য পরীক্ষা তৈরি করা হয়েছে',
      duplicateError: 'নির্বাচিত ক্লাস(গুলোর) জন্য পরীক্ষা ইতিমধ্যে বিদ্যমান',
      createError: 'পরীক্ষা তৈরি করতে ব্যর্থ হয়েছে',
      skippedPrefix: 'কিছু ক্লাস বাদ দেওয়া হয়েছে',
      genericError: 'পরীক্ষা সংরক্ষণ করতে ব্যর্থ হয়েছে',
      deleteSuccess: 'পরীক্ষা সফলভাবে মুছে ফেলা হয়েছে',
      deleteError: 'পরীক্ষা মুছে ফেলতে ব্যর্থ হয়েছে',
      nameReq: 'পরীক্ষার নাম প্রয়োজন',
      classReq: 'অন্তত একটি ক্লাস নির্বাচন করুন',
      editModeClassReq: 'সম্পাদনা মোডে একসাথে একটি ক্লাস সমর্থন করে',
      yearReq: 'শিক্ষাবর্ষ প্রয়োজন',
      yearFormat: 'শিক্ষাবর্ষ YYYY ফরম্যাটে হতে হবে',
      feeError: 'অ্যাডমিট কার্ড ফি ০ বা তার বেশি হতে হবে',
      subjectReq: 'এর জন্য অন্তত একটি বিষয় নির্বাচন করুন',
      slotDetailsReq: 'তারিখ, শুরুর সময় এবং শেষ সময় সেট করুন -',
      pastDateError: 'পরীক্ষার তারিখ অতীতে হতে পারবে না -',
      invalidSchedule: 'অবৈধ তারিখ বা সময় -',
      timeOrderError: 'শেষের সময় শুরুর সময়ের পরে হতে হবে -',
      overlapError: 'ক্লাসে দুটি পরীক্ষা একই সময়ে রাখা যাবে না',
      examExists: 'পরীক্ষা ইতিমধ্যে বিদ্যমান'
    },
    examTypes: {
      unitTest: 'ইউনিট টেস্ট',
      finalExam: 'বার্ষিক পরীক্ষা'
    }
  }
};

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const ACADEMIC_YEAR_REGEX = /^\d{4}$/;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0
};

const DEFAULT_FORM = {
  examName: '',
  examType: 'Unit Test',
  classIds: [],
  schedule: [],
  academicYear: '',
  admitCardFeeAmount: '0',
  description: ''
};

// EXAM_TYPE_OPTIONS and columns moved inside component for localization

export default function AdminExamsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const examTypeOptions = useMemo(() => [
    { value: 'Unit Test', label: t.examTypes.unitTest },
    { value: 'Final Exam', label: t.examTypes.finalExam }
  ], [t]);

  const columns = useMemo(() => [
    { key: 'examName', label: t.table.columns.examName },
    { key: 'className', label: t.table.columns.className },
    { key: 'section', label: t.table.columns.section },
    { key: 'subjects', label: t.table.columns.subjects },
    { key: 'examWindow', label: t.table.columns.examWindow },
    { key: 'academicYear', label: t.table.columns.academicYear },
    { key: 'actions', label: t.table.columns.actions }
  ], [t]);

  const toast = useToast();
  const todayDateInput = useMemo(() => getTodayDateInputValue(), []);

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingExams, setLoadingExams] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingExamId, setDeletingExamId] = useState('');

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingExamId, setEditingExamId] = useState('');

  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('');

  const [examRecords, setExamRecords] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const classOptions = useMemo(
    () =>
      classes.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item)
      })),
    [classes]
  );

  const allClassIds = useMemo(
    () => classOptions.map((item) => item.value).filter(Boolean),
    [classOptions]
  );

  const classLabelMap = useMemo(() => {
    return new Map(classOptions.map((item) => [item.value, item.label]));
  }, [classOptions]);

  const subjectMap = useMemo(() => {
    const map = new Map();
    subjects.forEach((item) => {
      map.set(toId(item), item);
    });

    return map;
  }, [subjects]);

  const subjectsByClassId = useMemo(() => {
    const map = new Map();

    subjects.forEach((item) => {
      const classId = toId(item?.classId);
      if (!classId) {
        return;
      }

      if (!map.has(classId)) {
        map.set(classId, []);
      }

      map.get(classId).push(item);
    });

    map.forEach((entries) => {
      entries.sort((first, second) => {
        const firstLabel = String(first?.name || first?.code || '').toLowerCase();
        const secondLabel = String(second?.name || second?.code || '').toLowerCase();
        return firstLabel.localeCompare(secondLabel);
      });
    });

    return map;
  }, [subjects]);

  const scheduleMap = useMemo(() => {
    const map = new Map();

    form.schedule.forEach((item) => {
      map.set(getScheduleKey(item.classId, item.subjectId), item);
    });

    return map;
  }, [form.schedule]);

  const isAllClassChecked =
    allClassIds.length > 0 && allClassIds.every((classId) => form.classIds.includes(classId));

  function onStartEdit(exam) {
    const classId = toId(exam?.classId);

    const normalizedSchedule = getScheduleFromExam(exam)
      .map((item) => ({
        classId: classId || String(item.classId || '').trim(),
        subjectId: String(item.subjectId || '').trim(),
        examDate: toLocalDateInputValue(item.startDate),
        startTime: toLocalTimeInputValue(item.startDate),
        endTime: toLocalTimeInputValue(item.endDate)
      }))
      .filter((item) => item.classId && item.subjectId);

    setEditingExamId(toId(exam));
    setForm({
      examName: String(exam?.examName || '').trim(),
      examType: normalizeExamType(exam?.examType),
      classIds: classId ? [classId] : [],
      schedule: normalizedSchedule,
      academicYear: String(exam?.academicYear || '').trim(),
      admitCardFeeAmount: String(Number(exam?.admitCardFeeAmount || 0)),
      description: String(exam?.description || '').trim()
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const tableRows = useMemo(
    () =>
      examRecords.map((item) => {
        const scheduleRows = getScheduleFromExam(item);
        const subjectCount = new Set(scheduleRows.map((entry) => entry.subjectId).filter(Boolean)).size;
        const previewRows = scheduleRows.slice(0, 2);
        const examCompleted = isExamCompleted(item);

        return {
          id: toId(item),
          examName: item.examName || '-',
          className: item.classId?.name || '-',
          section: item.classId?.section || '-',
          subjects:
            scheduleRows.length === 0 ? (
              '-'
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">
                  {subjectCount} subject slot{subjectCount === 1 ? '' : 's'}
                </p>
                {previewRows.map((entry, index) => {
                  const subjectId = toId(entry.subjectId);
                  const liveSubject = subjectMap.get(subjectId);
                  const subjectLabel =
                    entry.subjectId?.name ||
                    entry.subjectId?.code ||
                    liveSubject?.name ||
                    liveSubject?.code ||
                    'Subject';

                  return (
                    <p key={`${subjectId}-${index}`} className="text-xs text-slate-500">
                      {subjectLabel}: {toDateTimeLabel(entry.startDate)} to {toDateTimeLabel(entry.endDate)}
                    </p>
                  );
                })}
                {scheduleRows.length > previewRows.length ? (
                  <p className="text-xs text-slate-500">+{scheduleRows.length - previewRows.length} more slot(s)</p>
                ) : null}
              </div>
            ),
          examWindow: toExamWindowLabel(item.startDate || item.date || item.examDate, item.endDate),
          academicYear: item.academicYear || '-',
          actions: (
            <div className="flex items-center gap-2">
              {!examCompleted ? (
                <Link
                  href={`/admin/exams/${toId(item)}/admit-cards`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Admit Cards
                </Link>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartEdit(item);
                }}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(item);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          )
        };
      }),
    [examRecords, subjectMap]
  );

  const clearForm = () => {
    setForm(DEFAULT_FORM);
    setEditingExamId('');
  };

  const loadSetup = async () => {
    setLoadingSetup(true);

    try {
      const token = getToken();
      const [classesRes, subjectsRes] = await Promise.all([
        get('/classes', token),
        get('/subjects', token)
      ]);

      setClasses(Array.isArray(classesRes.data) ? classesRes.data : []);
      setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
    } finally {
      setLoadingSetup(false);
    }
  };

  const loadExams = async (pageToLoad = pagination.page) => {
    setLoadingExams(true);

    try {
      const query = new URLSearchParams();
      query.set('page', String(pageToLoad));
      query.set('limit', String(pagination.limit));

      if (search.trim()) {
        query.set('search', search.trim());
      }

      if (filterClassId) {
        query.set('classId', filterClassId);
      }

      const response = await get(`/exams?${query.toString()}`, getToken());

      setExamRecords(Array.isArray(response.data) ? response.data : []);
      const nextPagination = response.pagination || {};
      setPagination((prev) => ({
        ...prev,
        page: Number(nextPagination.page || pageToLoad || 1),
        total: Number(nextPagination.total || 0),
        totalPages: Number(nextPagination.totalPages || 0)
      }));
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.loadExamsError);
      setExamRecords([]);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    loadSetup().catch((apiError) => {
      toast.error(apiError.message || t.alerts.loadSetupError);
    });
  }, []);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [search, filterClassId]);

  useEffect(() => {
    loadExams(pagination.page).catch((apiError) => {
      toast.error(apiError.message || t.alerts.loadExamsError);
    });
  }, [pagination.page, search, filterClassId]);

  useEffect(() => {
    const validClassIdSet = new Set(allClassIds);
    const subjectClassMap = new Map(
      subjects
        .map((item) => [toId(item), toId(item?.classId)])
        .filter(([subjectId, classId]) => subjectId && classId)
    );

    setForm((prev) => {
      const nextClassIds = prev.classIds.filter((classId) => validClassIdSet.has(classId));
      const allowedClassIdSet = new Set(nextClassIds);

      const nextSchedule = prev.schedule.filter((row) => {
        const classId = String(row?.classId || '').trim();
        const subjectId = String(row?.subjectId || '').trim();

        if (!classId || !subjectId) {
          return false;
        }

        if (!allowedClassIdSet.has(classId)) {
          return false;
        }

        return subjectClassMap.get(subjectId) === classId;
      });

      const sameClassIds =
        nextClassIds.length === prev.classIds.length && nextClassIds.every((item, index) => item === prev.classIds[index]);

      if (sameClassIds && scheduleRowsEqual(nextSchedule, prev.schedule)) {
        return prev;
      }

      return {
        ...prev,
        classIds: nextClassIds,
        schedule: nextSchedule
      };
    });
  }, [allClassIds, subjects]);

  const sortClassIdsByOptionOrder = (classIds) => {
    const order = new Map(allClassIds.map((item, index) => [item, index]));

    return Array.from(new Set(classIds)).sort((first, second) => {
      const firstOrder = order.get(first) ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = order.get(second) ?? Number.MAX_SAFE_INTEGER;
      return firstOrder - secondOrder;
    });
  };

  const onChangeForm = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const onToggleClass = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists
        ? prev.classIds.filter((item) => item !== classId)
        : sortClassIdsByOptionOrder([...prev.classIds, classId]);

      const allowedClassIdSet = new Set(nextClassIds);

      return {
        ...prev,
        classIds: nextClassIds,
        schedule: prev.schedule.filter((row) => allowedClassIdSet.has(row.classId))
      };
    });
  };

  const onToggleAllClasses = () => {
    setForm((prev) => {
      const alreadySelectedAll = allClassIds.length > 0 && allClassIds.every((classId) => prev.classIds.includes(classId));

      if (alreadySelectedAll) {
        return {
          ...prev,
          classIds: [],
          schedule: []
        };
      }

      const allClassSet = new Set(allClassIds);

      return {
        ...prev,
        classIds: [...allClassIds],
        schedule: prev.schedule.filter((row) => allClassSet.has(row.classId))
      };
    });
  };

  const onToggleSubject = (classId, subjectId) => {
    setForm((prev) => {
      const targetKey = getScheduleKey(classId, subjectId);
      const exists = prev.schedule.some((row) => getScheduleKey(row.classId, row.subjectId) === targetKey);

      if (exists) {
        return {
          ...prev,
          schedule: prev.schedule.filter((row) => getScheduleKey(row.classId, row.subjectId) !== targetKey)
        };
      }

      const templateSlot = prev.schedule.find((row) => row.classId === classId && row.examDate && row.startTime && row.endTime);

      return {
        ...prev,
        schedule: [
          ...prev.schedule,
          {
            classId,
            subjectId,
            examDate: templateSlot?.examDate || '',
            startTime: templateSlot?.startTime || '',
            endTime: templateSlot?.endTime || ''
          }
        ]
      };
    });
  };

  const onUpdateScheduleField = (classId, subjectId, field, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((row) =>
        row.classId === classId && row.subjectId === subjectId
          ? {
              ...row,
              [field]: value
            }
          : row
      )
    }));
  };

  const onCopyTimingToClass = (classId) => {
    setForm((prev) => {
      const classRows = prev.schedule.filter((row) => row.classId === classId && row.examDate && row.startTime && row.endTime);
      if (classRows.length < 2) {
        return prev;
      }

      const baseSlot = classRows[0];

      return {
        ...prev,
        schedule: prev.schedule.map((row) =>
          row.classId !== classId
            ? row
            : {
                ...row,
                examDate: baseSlot.examDate,
                startTime: baseSlot.startTime,
                endTime: baseSlot.endTime
              }
        )
      };
    });
  };

  const validateForm = () => {
    if (!form.examName.trim()) {
      return t.alerts.nameReq;
    }

    if (form.classIds.length === 0) {
      return t.alerts.classReq;
    }

    if (editingExamId && form.classIds.length !== 1) {
      return t.alerts.editModeClassReq;
    }

    if (!form.academicYear.trim()) {
      return t.alerts.yearReq;
    }

    if (!examTypeOptions.some((option) => option.value === form.examType)) {
      return t.alerts.selectVariant || 'Select a valid exam type';
    }

    if (!ACADEMIC_YEAR_REGEX.test(form.academicYear.trim())) {
      return t.alerts.yearFormat;
    }

    const admitCardFeeAmount = Number(form.admitCardFeeAmount);
    if (!Number.isFinite(admitCardFeeAmount) || admitCardFeeAmount < 0) {
      return t.alerts.feeError;
    }

    for (const classId of form.classIds) {
      const classLabel = classLabelMap.get(classId) || (language === 'bn' ? 'নির্বাচিত ক্লাস' : 'selected class');
      const classRows = form.schedule.filter((row) => row.classId === classId);
      const classSlots = [];

      if (classRows.length === 0) {
        return `${t.alerts.subjectReq} ${classLabel}`;
      }

      for (const row of classRows) {
        const subject = subjectMap.get(row.subjectId);
        const subjectLabel = subject?.name || subject?.code || (language === 'bn' ? 'বিষয়' : 'subject');

        if (!row.examDate || !row.startTime || !row.endTime) {
          return `${t.alerts.slotDetailsReq} ${subjectLabel} (${classLabel})`;
        }

        if (row.examDate < todayDateInput) {
          return `${t.alerts.pastDateError} ${subjectLabel} (${classLabel})`;
        }

        const startDate = combineDateAndTime(row.examDate, row.startTime);
        const endDate = combineDateAndTime(row.examDate, row.endTime);

        if (!startDate || !endDate) {
          return `${t.alerts.invalidSchedule} ${subjectLabel} (${classLabel})`;
        }

        if (endDate.getTime() < startDate.getTime()) {
          return `${t.alerts.timeOrderError} ${subjectLabel} (${classLabel})`;
        }

        classSlots.push({
          subjectLabel,
          startDate,
          endDate
        });
      }

      for (let index = 0; index < classSlots.length; index += 1) {
        for (let peerIndex = index + 1; peerIndex < classSlots.length; peerIndex += 1) {
          const firstSlot = classSlots[index];
          const secondSlot = classSlots[peerIndex];

          if (hasTimeOverlap(firstSlot.startDate, firstSlot.endDate, secondSlot.startDate, secondSlot.endDate)) {
            return `${t.alerts.overlapError} (${classLabel}: ${firstSlot.subjectLabel} ${language === 'bn' ? 'এবং' : 'and'} ${secondSlot.subjectLabel})`;
          }
        }
      }
    }

    return '';
  };

  const buildPayloadForClass = (classId) => {
    const classRows = form.schedule.filter((row) => row.classId === classId);

    if (classRows.length === 0) {
      throw new Error('Select at least one subject for every selected class');
    }

    const subjectIdSet = new Set();
    const scheduleWindows = [];
    const schedule = [];
    let minStartMs = Number.POSITIVE_INFINITY;
    let maxEndMs = 0;

    classRows.forEach((row) => {
      const subjectId = String(row.subjectId || '').trim();
      const startDate = combineDateAndTime(row.examDate, row.startTime);
      const endDate = combineDateAndTime(row.examDate, row.endTime);

      if (!subjectId || !startDate || !endDate) {
        throw new Error('Each selected subject must have valid schedule date and time');
      }

      if (endDate.getTime() < startDate.getTime()) {
        throw new Error('Subject schedule end time must be after start time');
      }

      const overlapWindow = scheduleWindows.find((window) =>
        hasTimeOverlap(startDate, endDate, window.startDate, window.endDate)
      );
      if (overlapWindow) {
        throw new Error('Two subjects in the same class cannot have exam at the same time');
      }

      scheduleWindows.push({
        startDate,
        endDate
      });

      subjectIdSet.add(subjectId);

      minStartMs = Math.min(minStartMs, startDate.getTime());
      maxEndMs = Math.max(maxEndMs, endDate.getTime());

      schedule.push({
        classId,
        subjectId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    });

    schedule.sort((first, second) => {
      const firstStart = new Date(first.startDate).getTime();
      const secondStart = new Date(second.startDate).getTime();
      return firstStart - secondStart;
    });

    if (subjectIdSet.size === 0 || !Number.isFinite(minStartMs) || !Number.isFinite(maxEndMs)) {
      throw new Error('At least one valid subject schedule is required');
    }

    return {
      examName: form.examName.trim(),
      examType: normalizeExamType(form.examType),
      classId,
      subjects: Array.from(subjectIdSet),
      academicYear: form.academicYear.trim(),
      admitCardFeeAmount: Number(form.admitCardFeeAmount || 0),
      startDate: new Date(minStartMs).toISOString(),
      endDate: new Date(maxEndMs).toISOString(),
      description: form.description.trim(),
      schedule
    };
  };

  const onSubmitExam = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setSubmitting(true);

    try {
      const token = getToken();

      if (editingExamId) {
        const targetClassId = form.classIds[0];
        const payload = buildPayloadForClass(targetClassId);

        await put(`/exams/${editingExamId}`, payload, token);
        toast.success(t.alerts.updateSuccess);
        clearForm();
        await loadExams(1);
        return;
      }

      const classPayloads = form.classIds.map((classId) => ({
        classId,
        payload: buildPayloadForClass(classId)
      }));

      const results = await Promise.allSettled(
        classPayloads.map((entry) => post('/exams', entry.payload, token))
      );

      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedResults = results.filter((result) => result.status === 'rejected');
      const failedCount = failedResults.length;

      if (successCount > 0) {
        toast.success(successCount === 1 ? t.alerts.createSuccess : `${t.alerts.multiCreateSuccessPrefix} ${successCount} ${t.alerts.multiCreateSuccessSuffix}`);
        clearForm();
        await loadExams(1);
      }

      if (failedCount > 0) {
        const duplicateCount = failedResults.filter((result) => result.reason?.statusCode === 409).length;

        if (successCount === 0 && duplicateCount === failedCount) {
          toast.error(t.alerts.duplicateError);
          return;
        }

        if (successCount === 0) {
          toast.error(failedResults[0]?.reason?.message || t.alerts.createError);
          return;
        }

        const duplicateMessage = duplicateCount > 0 ? (language === 'bn' ? `${duplicateCount}টি কপি` : `${duplicateCount} duplicate`) : '';
        const genericFailureCount = failedCount - duplicateCount;
        const genericFailureMessage = genericFailureCount > 0 ? (language === 'bn' ? `${genericFailureCount}টি ব্যর্থ` : `${genericFailureCount} failed`) : '';
        const summary = [duplicateMessage, genericFailureMessage].filter(Boolean).join(', ');

        toast.error(`${t.alerts.skippedPrefix} (${summary || (language === 'bn' ? `${failedCount}টি ব্যর্থ` : `${failedCount} failed`)})`);
      }
    } catch (apiError) {
      if (apiError?.statusCode === 409) {
        toast.error(t.alerts.examExists);
      } else {
        toast.error(apiError.message || t.alerts.genericError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteExam = async () => {
    if (!deleteTarget?._id) {
      return;
    }

    setDeletingExamId(toId(deleteTarget));

    try {
      await del(`/exams/${toId(deleteTarget)}`, getToken());
      toast.success(t.alerts.deleteSuccess);
      setDeleteTarget(null);

      const shouldMoveToPreviousPage = examRecords.length === 1 && pagination.page > 1;
      const nextPage = shouldMoveToPreviousPage ? pagination.page - 1 : pagination.page;
      setPagination((prev) => ({ ...prev, page: nextPage }));

      await loadExams(nextPage);
    } catch (apiError) {
      toast.error(apiError.message || t.alerts.deleteError);
    } finally {
      setDeletingExamId('');
    }
  };

  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <form onSubmit={onSubmitExam} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{editingExamId ? t.editPlan : t.createPlan}</h3>
        <p className="mb-4 text-sm text-slate-600">
          {t.planSubtitle}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label={t.form.examName}
            value={form.examName}
            onChange={onChangeForm('examName')}
            required
            className="h-11"
            placeholder={t.search.placeholder}
          />

          <Select
            label={t.form.examType}
            value={form.examType}
            onChange={onChangeForm('examType')}
            required
            className="h-11"
            options={examTypeOptions}
          />

          <Input
            label={t.form.academicYear}
            value={form.academicYear}
            onChange={onChangeForm('academicYear')}
            required
            className="h-11"
            placeholder="2026"
          />

          <Input
            label={t.form.fee}
            type="number"
            min="0"
            step="0.01"
            value={form.admitCardFeeAmount}
            onChange={onChangeForm('admitCardFeeAmount')}
            className="h-11"
            placeholder="0"
          />

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t.form.selectClass}</label>
            <div className="rounded-lg border border-slate-300 p-3">
              <label className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={isAllClassChecked}
                  onChange={onToggleAllClasses}
                  disabled={loadingSetup || Boolean(editingExamId) || allClassIds.length === 0}
                />
                <span>{t.form.allClasses}</span>
              </label>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.classIds.includes(option.value)}
                      onChange={() => onToggleClass(option.value)}
                      disabled={loadingSetup || Boolean(editingExamId)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              {editingExamId ? (
                <p className="mt-2 text-xs text-amber-700">
                  {t.form.lockedHint}
                </p>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t.form.schedule}</label>
            <div className="rounded-lg border border-slate-300 p-3">
              {form.classIds.length === 0 ? (
                <p className="text-sm text-slate-500">{t.form.noClasses}</p>
              ) : (
                <div className="space-y-3">
                  {form.classIds.map((classId) => {
                    const classLabel = classLabelMap.get(classId) || (language === 'bn' ? 'নির্বাচিত ক্লাস' : 'Selected Class');
                    const classSubjects = subjectsByClassId.get(classId) || [];
                    const activeClassSlots = form.schedule.filter((row) => row.classId === classId);

                    return (
                      <div key={classId} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">{classLabel}</h4>
                            <p className="text-xs text-slate-600">
                              {t.form.scheduleSubtitle}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onCopyTimingToClass(classId)}
                            disabled={activeClassSlots.length < 2}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t.form.copyTiming}
                          </button>
                        </div>

                        {classSubjects.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">{t.form.noSubjects}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {classSubjects.map((subject) => {
                              const subjectId = toId(subject);
                              const scheduleKey = getScheduleKey(classId, subjectId);
                              const activeSlot = scheduleMap.get(scheduleKey);
                              const isSelected = Boolean(activeSlot);

                              return (
                                <div key={scheduleKey} className="rounded-md border border-slate-200 bg-white p-3">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => onToggleSubject(classId, subjectId)}
                                      disabled={loadingSetup}
                                    />
                                    <span className="font-medium text-slate-900">{subject?.name || (language === 'bn' ? 'বিষয়' : 'Subject')}</span>
                                    {subject?.code ? <span className="text-xs text-slate-500">({subject.code})</span> : null}
                                  </label>

                                  {isSelected ? (
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-600">{t.form.examDate}</span>
                                        <input
                                          type="date"
                                          min={todayDateInput}
                                          value={activeSlot?.examDate || ''}
                                          onChange={(event) =>
                                            onUpdateScheduleField(classId, subjectId, 'examDate', event.target.value)
                                          }
                                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                                          required
                                        />
                                      </label>

                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-600">{t.form.startTime}</span>
                                        <input
                                          type="time"
                                          value={activeSlot?.startTime || ''}
                                          onChange={(event) =>
                                            onUpdateScheduleField(classId, subjectId, 'startTime', event.target.value)
                                          }
                                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                                          required
                                        />
                                      </label>

                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-600">{t.form.endTime}</span>
                                        <input
                                          type="time"
                                          value={activeSlot?.endTime || ''}
                                          onChange={(event) =>
                                            onUpdateScheduleField(classId, subjectId, 'endTime', event.target.value)
                                          }
                                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                                          required
                                        />
                                      </label>
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-slate-500">{t.form.enableSubject}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{t.form.plannedSlots}: {form.schedule.length}</p>
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t.form.description}</span>
          <textarea
            value={form.description}
            onChange={onChangeForm('description')}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
            placeholder={t.form.descriptionPlaceholder}
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t.form.saving : editingExamId ? t.form.update : t.form.save}
          </button>

          {editingExamId ? (
            <button
              type="button"
              onClick={clearForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {t.form.cancelEdit}
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t.search.title}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11"
            placeholder={t.search.placeholder}
          />

          <Select
            label={t.search.filter}
            value={filterClassId}
            onChange={(event) => setFilterClassId(event.target.value)}
            className="h-11"
            options={[{ value: '', label: t.search.allClasses }, ...classOptions]}
          />
        </div>
      </div>

      <Table columns={columns} rows={tableRows} loading={loadingExams} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          {t.pagination.prefix} {pagination.page} {t.pagination.mid} {pagination.totalPages || 0} | {t.pagination.total}: {pagination.total}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
            disabled={!hasPrevious || loadingExams}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t.pagination.prev}
          </button>
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!hasNext || loadingExams}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t.pagination.next}
          </button>
        </div>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{t.delete.title}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.delete.textPrefix}{' '}
              <span className="font-semibold text-slate-900">{deleteTarget.examName || (language === 'bn' ? 'এই পরীক্ষা' : 'this exam')}</span>.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t.delete.cancel}
              </button>
              <button
                type="button"
                onClick={onDeleteExam}
                disabled={deletingExamId === toId(deleteTarget)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingExamId === toId(deleteTarget) ? t.delete.deleting : t.delete.delete}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
