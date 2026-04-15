'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
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
    title: 'Classes & Subjects',
    description: 'Create classes and manage subjects under each class from one place.',
    addClass: {
      title: 'Add Class',
      subtitle: 'Create classes first. Same class name is allowed across different sections.',
      name: 'Class Name *',
      section: 'Section',
      placeholder: 'A / B',
      button: 'Add Class',
      loading: 'Adding...'
    },
    manageClasses: {
      title: 'Edit Or Delete Classes',
      subtitle: 'Update class names/sections or delete classes that are no longer needed.',
      empty: 'No classes found yet.',
      subjects: 'subjects',
      studentsHint: 'Click any class row to view all students registered in that class.',
      enriching: 'Refreshing subject and teacher insights...'
    },
    manageSubjects: {
      title: 'Manage Subjects By Class & Section',
      subtitle: 'Select class name first, then select section. Both are required to add subjects.',
      empty: 'No classes found. Add a class with section first to manage subjects.',
      selected: 'Currently Selected',
      classLabel: 'Class',
      sectionLabel: 'Section',
      notSelected: 'Not selected',
      chooseClass: 'Choose a class',
      chooseSection: 'Choose a section',
      selectClassFirst: 'Select class first',
      noSection: '(No Section)',
      addSubject: 'Add Subject',
      adding: 'Adding...',
      name: 'Subject Name *',
      code: 'Subject Code',
      mathPlaceholder: 'Mathematics',
      mathCodePlaceholder: 'MATH',
      noSubjects: 'No subjects found for the selected class and section yet.'
    },
    delete: {
      confirmClass: 'Confirm Class Deletion',
      textPrefix: 'Type class label',
      textMid: 'to permanently delete this class.',
      enterClass: 'Enter class label',
      cancel: 'Cancel',
      delete: 'Delete',
      deleting: 'Deleting...',
      confirmSubject: 'Subject deleted successfully.'
    },
    edit: {
      save: 'Save',
      saving: 'Saving...',
      edit: 'Edit'
    },
    columns: {
      name: 'Class',
      section: 'Section',
      subjects: 'Subjects',
      teachers: 'Teachers By Subject'
    },
    teacherStatus: {
      notAssigned: 'Not Assigned'
    },
    alerts: {
      delayedInsights: 'Some class insights are delayed. Please refresh in a moment.',
      nameReq: 'Class name is required.',
      updateSuccess: 'Class updated successfully.',
      duplicateError: 'Class with the same name and section already exists. Try a different section.',
      deleteSuccess: 'Class deleted successfully.',
      deleteMismatch: 'Deletion cancelled. Class name and section did not match.',
      addSuccess: 'Class added successfully.',
      selectClassReq: 'Please select a class name first.',
      selectSectionReq: 'Please select a section.',
      selectBothReq: 'Please select both class and section before adding subjects.',
      classNotFound: 'Selected class not found. Please refresh and try again.',
      subjectNameReq: 'Subject name is required.',
      subjectAddSuccess: 'Subject added successfully to',
      subjectUpdateSuccess: 'Subject updated successfully.',
      subjectDeleteSuccess: 'Subject deleted successfully.'
    },
    placeholders: {
      class: 'Class'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'ক্লাস এবং বিষয়',
    description: 'এক জায়গা থেকে ক্লাস তৈরি করুন এবং প্রতিটি ক্লাসের অধীনে বিষয়গুলি পরিচালনা করুন।',
    addClass: {
      title: 'ক্লাস যোগ করুন',
      subtitle: 'প্রথমে ক্লাস তৈরি করুন। বিভিন্ন সেকশনে একই ক্লাসের নাম অনুমোদিত।',
      name: 'ক্লাসের নাম *',
      section: 'সেকশন',
      placeholder: 'ক / খ',
      button: 'ক্লাস যোগ করুন',
      loading: 'যোগ করা হচ্ছে...'
    },
    manageClasses: {
      title: 'ক্লাস সম্পাদনা বা মুছুন',
      subtitle: 'ক্লাসের নাম/সেকশন আপডেট করুন বা আর প্রয়োজন নেই এমন ক্লাস মুছে ফেলুন।',
      empty: 'এখনও কোনো ক্লাস পাওয়া যায়নি।',
      subjects: 'বিষয়',
      studentsHint: 'ঐ ক্লাসে নিবন্ধিত সকল শিক্ষার্থীকে দেখতে যেকোনো ক্লাস সারিতে ক্লিক করুন।',
      enriching: 'বিষয় এবং শিক্ষক তথ্য রিফ্রেশ করা হচ্ছে...'
    },
    manageSubjects: {
      title: 'ক্লাস এবং সেকশন অনুযায়ী বিষয় পরিচালনা',
      subtitle: 'প্রথমে ক্লাসের নাম নির্বাচন করুন, তারপর সেকশন। বিষয় যোগ করতে উভয়ই প্রয়োজনীয়।',
      empty: 'কোনো ক্লাস পাওয়া যায়নি। বিষয় পরিচালনা করতে প্রথমে সেকশন সহ একটি ক্লাস যোগ করুন।',
      selected: 'বর্তমানে নির্বাচিত',
      classLabel: 'ক্লাস',
      sectionLabel: 'সেকশন',
      notSelected: 'নির্বাচিত নয়',
      chooseClass: 'একটি ক্লাস বেছে নিন',
      chooseSection: 'একটি সেকশন বেছে নিন',
      selectClassFirst: 'প্রথমে ক্লাস নির্বাচন করুন',
      noSection: '(কোনো সেকশন নেই)',
      addSubject: 'বিষয় যোগ করুন',
      adding: 'যোগ করা হচ্ছে...',
      name: 'বিষয়ের নাম *',
      code: 'বিষয় কোড',
      mathPlaceholder: 'গণিত',
      mathCodePlaceholder: 'MATH',
      noSubjects: 'নির্বাচিত ক্লাস এবং সেকশনের জন্য এখনও কোনো বিষয় পাওয়া যায়নি।'
    },
    delete: {
      confirmClass: 'ক্লাস মুছে ফেলার নিশ্চিতকরণ',
      textPrefix: 'ক্লাস লেবেল',
      textMid: 'স্থায়ীভাবে মুছতে টাইপ করুন।',
      enterClass: 'ক্লাস লেবেল লিখুন',
      cancel: 'বাতিল',
      delete: 'মুছুন',
      deleting: 'মুছে ফেলা হচ্ছে...',
      confirmSubject: 'বিষয় সফলভাবে মুছে ফেলা হয়েছে।'
    },
    edit: {
      save: 'সংরক্ষণ',
      saving: 'সংরক্ষণ হচ্ছে...',
      edit: 'সম্পাদনা'
    },
    columns: {
      name: 'ক্লাস',
      section: 'সেকশন',
      subjects: 'বিষয়সমূহ',
      teachers: 'বিষয় অনুযায়ী শিক্ষক'
    },
    teacherStatus: {
      notAssigned: 'নিযুক্ত নয়'
    },
    alerts: {
      delayedInsights: 'কিছু ক্লাস তথ্য পেতে দেরি হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পর রিফ্রেশ করুন।',
      nameReq: 'ক্লাসের নাম প্রয়োজন।',
      updateSuccess: 'ক্লাস সফলভাবে আপডেট হয়েছে।',
      duplicateError: 'একই নাম এবং সেকশনের ক্লাস ইতিমধ্যে বিদ্যমান। অন্য সেকশন চেষ্টা করুন।',
      deleteSuccess: 'ক্লাস সফলভাবে মুছে ফেলা হয়েছে।',
      deleteMismatch: 'মুছে ফেলা বাতিল হয়েছে। ক্লাসের নাম এবং সেকশন মেলেনি।',
      addSuccess: 'ক্লাস সফলভাবে যোগ করা হয়েছে।',
      selectClassReq: 'অনুগ্রহ করে প্রথমে একটি ক্লাসের নাম নির্বাচন করুন।',
      selectSectionReq: 'অনুগ্রহ করে একটি সেকশন নির্বাচন করুন।',
      selectBothReq: 'বিষয় যোগ করার আগে অনুগ্রহ করে ক্লাস এবং সেকশন উভয়ই নির্বাচন করুন।',
      classNotFound: 'নির্বাচিত ক্লাস পাওয়া যায়নি। অনুগ্রহ করে রিফ্রেশ করে আবার চেষ্টা করুন।',
      subjectNameReq: 'বিষয়ের নাম প্রয়োজন।',
      subjectAddSuccess: 'বিষয়টি সফলভাবে যোগ করা হয়েছে',
      subjectUpdateSuccess: 'বিষয়টি সফলভাবে আপডেট করা হয়েছে।',
      subjectDeleteSuccess: 'বিষয়টি সফলভাবে মুছে ফেলা হয়েছে।'
    },
    placeholders: {
      class: 'ক্লাস'
    }
  }
};

// Columns moved inside component for localization

const getInitialClassForm = () => ({
  name: '',
  section: ''
});
const getInitialSubjectForm = () => ({
  name: '',
  code: ''
});

const normalizeSubjectCode = (value) => String(value || '').toUpperCase();

const isClassDuplicateResponse = (apiError) => {
  const statusCode = Number(apiError?.statusCode || 0);
  if (statusCode === 409) {
    return true;
  }

  const normalizedMessage = String(apiError?.message || '').toLowerCase();
  const normalizedRawMessage = String(apiError?.rawMessage || '').toLowerCase();

  return (
    normalizedMessage.includes('same name and section') ||
    normalizedRawMessage.includes('same name and section') ||
    normalizedRawMessage.includes('duplicate key')
  );
};

const normalizeConfirmationLabel = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')');

const isConfirmationLabelMatch = (typedValue, expectedValue) =>
  normalizeConfirmationLabel(typedValue) === normalizeConfirmationLabel(expectedValue);

export default function AdminClassesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const classColumns = useMemo(() => [
    { key: 'name', label: t.columns.name },
    { key: 'section', label: t.columns.section },
    { key: 'subjectCount', label: t.columns.subjects },
    { key: 'teacherPerSubject', label: t.columns.teachers }
  ], [t]);

  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [classesData, setClassesData] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [subjectRows, setSubjectRows] = useState([]);
  const [enrichingRows, setEnrichingRows] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedClassSection, setSelectedClassSection] = useState('');
  const [classForm, setClassForm] = useState(getInitialClassForm());
  const [editClassId, setEditClassId] = useState('');
  const [editClassForm, setEditClassForm] = useState(getInitialClassForm());
  const [subjectForm, setSubjectForm] = useState(getInitialSubjectForm());
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editSubjectForm, setEditSubjectForm] = useState(getInitialSubjectForm());
  const [loading, setLoading] = useState(false);
  const [submittingClass, setSubmittingClass] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState('');
  const [deleteClassTarget, setDeleteClassTarget] = useState(null);
  const [typedClassLabel, setTypedClassLabel] = useState('');
  const [submittingSubject, setSubmittingSubject] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState('');

  const buildClassRows = (classes, subjects, teacherNamesBySubjectId = {}) => {
    const subjectsByClass = subjects.reduce((acc, item) => {
      if (!item.classId) {
        return acc;
      }

      const key = String(item.classId);
      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(item);
      return acc;
    }, {});

    return classes.map((item) => {
      const classId = String(item._id);
      const classSubjects = subjectsByClass[classId] || [];

      return {
        id: classId,
        name: formatClassLabel(item),
        section: item.section || '-',
        subjectCount: String(classSubjects.length),
        teacherPerSubject: classSubjects.length === 0
          ? '-'
          : (
            <div className="space-y-1">
              {classSubjects.map((subject) => {
                const assignedTeacherNames = teacherNamesBySubjectId[subject.id] || [];
                return (
                  <p key={subject.id} className="text-xs text-slate-700 dark:text-slate-100">
                    {subject.name}: {assignedTeacherNames.length > 0 ? assignedTeacherNames.join(', ') : t.teacherStatus.notAssigned}
                  </p>
                );
              })}
            </div>
          )
      };
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const classResponse = await get('/classes', token);
      const classes = classResponse.data || [];

      setClassesData(classes);

      // Render classes immediately; enrich subject/teacher counts in background.
      setRows(buildClassRows(classes, []));

      setClassOptions(
        classes.map((item) => ({
          value: String(item._id),
          label: formatClassLabel(item, t.placeholders.class)
        }))
      );
      setSubjectRows([]);

      const classIdSet = new Set(classes.map((item) => String(item._id)));
      setSelectedClassId((previous) => {
        if (previous && classIdSet.has(previous)) {
          return previous;
        }
        return classes[0]?._id ? String(classes[0]._id) : '';
      });

      setEnrichingRows(true);
      const [subjectResult, teacherResult] = await Promise.allSettled([
        get('/subjects', token),
        get('/teachers', token)
      ]);

      const subjects = subjectResult.status === 'fulfilled'
        ? (subjectResult.value.data || []).map((item) => ({
          id: String(item._id),
          classId: String(item.classId?._id || item.classId || ''),
          name: item.name || '-',
          code: item.code || ''
        }))
        : [];

      const teacherNamesBySubjectId = teacherResult.status === 'fulfilled'
        ? (teacherResult.value.data || []).reduce((acc, teacher) => {
          const teacherLabel = String(teacher?.userId?.name || teacher?.teacherId || '').trim();
          (teacher.subjects || [])
            .map((item) => String(item?._id || item || ''))
            .filter(Boolean)
            .forEach((subjectId) => {
              if (!acc[subjectId]) {
                acc[subjectId] = [];
              }

              if (teacherLabel && !acc[subjectId].includes(teacherLabel)) {
                acc[subjectId].push(teacherLabel);
              }
            });

          return acc;
        }, {})
        : {};

      setSubjectRows(subjects);
      setRows(buildClassRows(classes, subjects, teacherNamesBySubjectId));

      if (subjectResult.status === 'rejected' || teacherResult.status === 'rejected') {
        toast.info(t.alerts.delayedInsights);
      }
    } catch (apiError) {
      setRows([]);
      setClassesData([]);
      setClassOptions([]);
      setSubjectRows([]);
      setSelectedClassId('');
      toast.error(apiError.message);
    } finally {
      setLoading(false);
      setEnrichingRows(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const uniqueClassNames = useMemo(
    () => Array.from(new Set(classesData.map((c) => c.name))).sort(),
    [classesData]
  );

  const availableSections = useMemo(
    () => {
      if (!selectedClassName) return [];
      return classesData
        .filter((c) => c.name === selectedClassName)
        .map((c) => c.section || '')
        .sort();
    },
    [classesData, selectedClassName]
  );

  const selectedClassSubjects = useMemo(
    () => subjectRows.filter((item) => item.classId === selectedClassId),
    [subjectRows, selectedClassId]
  );

  const subjectCountByClassId = useMemo(
    () => subjectRows.reduce((acc, item) => {
      if (!item.classId) {
        return acc;
      }

      acc[item.classId] = (acc[item.classId] || 0) + 1;
      return acc;
    }, {}),
    [subjectRows]
  );

  const onClassFormChange = (field) => (event) => {
    setClassForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onEditClassFormChange = (field) => (event) => {
    setEditClassForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onSubjectFormChange = (field) => (event) => {
    const nextValue = field === 'code' ? normalizeSubjectCode(event.target.value) : event.target.value;
    setSubjectForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const onEditSubjectFormChange = (field) => (event) => {
    const nextValue = field === 'code' ? normalizeSubjectCode(event.target.value) : event.target.value;
    setEditSubjectForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const onStartEditClass = (classItem) => {
    setEditClassId(String(classItem?._id || ''));
    setEditClassForm({
      name: classItem?.name || '',
      section: classItem?.section || ''
    });
  };

  const onCancelEditClass = () => {
    setEditClassId('');
    setEditClassForm(getInitialClassForm());
  };

  const onSaveClass = async (classId) => {
    const normalizedName = String(editClassForm.name || '').trim();
    if (!normalizedName) {
      toast.error(t.alerts.nameReq);
      return;
    }

    setSavingClass(true);

    try {
      await put(
        `/classes/${classId}`,
        {
          name: normalizedName,
          section: String(editClassForm.section || '').trim() || undefined
        },
        getToken()
      );

      toast.success(t.alerts.updateSuccess);
      onCancelEditClass();
      await loadData();
    } catch (apiError) {
      if (isClassDuplicateResponse(apiError)) {
        toast.error(t.alerts.duplicateError);
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSavingClass(false);
    }
  };

  const onDeleteClass = (classItem) => {
    setDeleteClassTarget(classItem);
    setTypedClassLabel('');
  };

  const onConfirmDeleteClass = async () => {
    if (!deleteClassTarget?._id) {
      return;
    }

    const expectedClassLabel = formatClassLabel(deleteClassTarget, t.placeholders.class);
    if (!isConfirmationLabelMatch(typedClassLabel, expectedClassLabel)) {
      toast.error(t.alerts.deleteMismatch);
      return;
    }

    const classId = String(deleteClassTarget._id);
    setDeletingClassId(classId);

    try {
      await del(`/classes/${classId}`, getToken());
      toast.success(t.alerts.deleteSuccess);
      if (editClassId === classId) {
        onCancelEditClass();
      }
      setDeleteClassTarget(null);
      setTypedClassLabel('');
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setDeletingClassId('');
    }
  };

  const onCreateClass = async (event) => {
    event.preventDefault();
    const normalizedName = String(classForm.name || '').trim();
    if (!normalizedName) {
      toast.error(t.alerts.nameReq);
      return;
    }

    setSubmittingClass(true);

    try {
      await post(
        '/classes',
        {
          name: normalizedName,
          section: String(classForm.section || '').trim() || undefined
        },
        getToken()
      );

      setClassForm(getInitialClassForm());
      toast.success(t.alerts.addSuccess);
      await loadData();
    } catch (apiError) {
      if (isClassDuplicateResponse(apiError)) {
        toast.error(t.alerts.duplicateError);
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSubmittingClass(false);
    }
  };

  const onCreateSubject = async (event) => {
    event.preventDefault();
    
    if (!selectedClassName) {
      toast.error(t.alerts.selectClassReq);
      return;
    }

    if (!selectedClassSection && availableSections.length > 0) {
      toast.error(t.alerts.selectSectionReq);
      return;
    }

    if (!selectedClassId) {
      toast.error(t.alerts.selectBothReq);
      return;
    }

    const selectedClass = classesData.find((c) => String(c._id) === selectedClassId);
    if (!selectedClass) {
      toast.error(t.alerts.classNotFound);
      return;
    }

    const normalizedName = String(subjectForm.name || '').trim();
    if (!normalizedName) {
      toast.error(t.alerts.subjectNameReq);
      return;
    }

    setSubmittingSubject(true);

    try {
      await post(
        '/subjects',
        {
          classId: selectedClassId,
          name: normalizedName,
          code: normalizeSubjectCode(String(subjectForm.code || '').trim()) || undefined
        },
        getToken()
      );
      const classLabel = selectedClass.section 
        ? `${selectedClass.name} (${selectedClass.section})`
        : selectedClass.name;
      setSubjectForm(getInitialSubjectForm());
      toast.success(`${t.alerts.subjectAddSuccess} ${classLabel}.`);
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setSubmittingSubject(false);
    }
  };

  const onStartEditSubject = (subject) => {
    setEditSubjectId(subject.id);
    setEditSubjectForm({
      name: subject.name || '',
      code: normalizeSubjectCode(subject.code || '')
    });
  };

  const onCancelEditSubject = () => {
    setEditSubjectId('');
    setEditSubjectForm(getInitialSubjectForm());
  };

  const onSaveSubject = async (subjectId) => {
    const normalizedName = String(editSubjectForm.name || '').trim();
    if (!normalizedName) {
      toast.error(t.alerts.subjectNameReq);
      return;
    }

    setSavingSubject(true);

    try {
      await put(
        `/subjects/${subjectId}`,
        {
          name: normalizedName,
          code: normalizeSubjectCode(String(editSubjectForm.code || '').trim()) || undefined
        },
        getToken()
      );
      toast.success(t.alerts.subjectUpdateSuccess);
      setEditSubjectId('');
      setEditSubjectForm(getInitialSubjectForm());
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setSavingSubject(false);
    }
  };

  const onDeleteSubject = async (subjectId) => {
    setDeletingSubjectId(subjectId);

    try {
      await del(`/subjects/${subjectId}`, getToken());
      toast.success(t.alerts.subjectDeleteSuccess);
      if (editSubjectId === subjectId) {
        onCancelEditSubject();
      }
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setDeletingSubjectId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <form onSubmit={onCreateClass} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t.addClass.title}</h3>
        <p className="mb-4 text-sm text-slate-600">{t.addClass.subtitle}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label={t.addClass.name} value={classForm.name} onChange={onClassFormChange('name')} required className="h-11" />
          <Input label={t.addClass.section} value={classForm.section} onChange={onClassFormChange('section')} className="h-11" placeholder={t.addClass.placeholder} />
        </div>

        <button
          type="submit"
          disabled={submittingClass}
          className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingClass ? t.addClass.loading : t.addClass.button}
        </button>
      </form>

      <Table columns={classColumns} rows={rows} loading={loading} getRowHref={(row) => `/admin/classes/${row.id}`} />
      <p className="text-xs text-slate-500">{t.manageClasses.studentsHint}</p>
      {enrichingRows && !loading && (
        <p className="text-xs text-slate-500">{t.manageClasses.enriching}</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t.manageClasses.title}</h3>
        <p className="mb-4 text-sm text-slate-600">{t.manageClasses.subtitle}</p>

        {classesData.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{t.manageClasses.empty}</p>
        ) : (
          <div className="space-y-2">
            {classesData.map((classItem) => {
              const classId = String(classItem._id);
              const isEditing = editClassId === classId;

              return (
                <div key={classId} className="rounded-lg border border-slate-200 bg-white p-3">
                  {isEditing ? (
                    <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
                      <Input
                        label={t.addClass.name}
                        value={editClassForm.name}
                        onChange={onEditClassFormChange('name')}
                        className="h-10"
                      />
                      <Input
                        label={t.addClass.section}
                        value={editClassForm.section}
                        onChange={onEditClassFormChange('section')}
                        className="h-10"
                        placeholder={t.addClass.placeholder}
                      />
                      <button
                        type="button"
                        onClick={() => onSaveClass(classId)}
                        disabled={savingClass}
                        className="mt-7 h-10 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingClass ? t.edit.saving : t.edit.save}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEditClass}
                        className="mt-7 h-10 rounded-md border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {t.delete.cancel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{formatClassLabel(classItem, t.placeholders.class)}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {subjectCountByClassId[classId] || 0} {t.manageClasses.subjects}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onStartEditClass(classItem)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {t.edit.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteClass(classItem)}
                          disabled={deletingClassId === classId}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingClassId === classId ? t.delete.deleting : t.delete.delete}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t.manageSubjects.title}</h3>
        <p className="mb-4 text-sm text-slate-600">{t.manageSubjects.subtitle}</p>

        {classOptions.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{t.manageSubjects.empty}</p>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">{t.manageSubjects.selected}</p>
              <p className="mt-1 text-sm font-medium text-blue-700">
                {selectedClassName ? (
                  <>
                    {t.manageSubjects.classLabel}: <span className="font-bold">{selectedClassName}</span>
                    {selectedClassSection && (
                      <>
                        {' '} | {t.manageSubjects.sectionLabel}: <span className="font-bold">{selectedClassSection}</span>
                      </>
                    )}
                    {!selectedClassSection && ` | ${t.manageSubjects.sectionLabel}: ${t.manageSubjects.notSelected}`}
                  </>
                ) : `${t.manageSubjects.classLabel}: ${t.manageSubjects.notSelected} | ${t.manageSubjects.sectionLabel}: ${t.manageSubjects.notSelected}`}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label={`${t.manageSubjects.chooseClass} *`}
                value={selectedClassName}
                onChange={(event) => {
                  const newClassName = event.target.value;
                  setSelectedClassName(newClassName);
                  setSelectedClassSection('');
                  setSelectedClassId('');
                  setEditSubjectId('');
                }}
                options={[
                  { value: '', label: t.manageSubjects.chooseClass },
                  ...uniqueClassNames.map((name) => ({ value: name, label: name }))
                ]}
                className="h-11"
                required
              />

              <Select
                label={`${t.manageSubjects.chooseSection} *`}
                value={selectedClassSection}
                onChange={(event) => {
                  const newSection = event.target.value;
                  setSelectedClassSection(newSection);
                  const matchedClass = classesData.find(
                    (c) => c.name === selectedClassName && (c.section || '') === newSection
                  );
                  setSelectedClassId(matchedClass ? String(matchedClass._id) : '');
                  setEditSubjectId('');
                }}
                options={[
                  { value: '', label: selectedClassName ? t.manageSubjects.chooseSection : t.manageSubjects.selectClassFirst },
                  ...availableSections.map((section) => ({
                    value: section,
                    label: section || t.manageSubjects.noSection
                  }))
                ]}
                className="h-11"
                disabled={!selectedClassName}
                required
              />
            </div>

            <form onSubmit={onCreateSubject} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_1fr_auto]">
              <Input
                label={t.manageSubjects.name}
                value={subjectForm.name}
                onChange={onSubjectFormChange('name')}
                required
                className="h-11"
                placeholder={t.manageSubjects.mathPlaceholder}
              />
              <Input
                label={t.manageSubjects.code}
                value={subjectForm.code}
                onChange={onSubjectFormChange('code')}
                className="h-11"
                placeholder={t.manageSubjects.mathCodePlaceholder}
              />
              <button
                type="submit"
                disabled={submittingSubject || !selectedClassId}
                className="mt-7 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingSubject ? t.manageSubjects.adding : t.manageSubjects.addSubject}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {!selectedClassName ? (
                <p className="text-sm text-slate-500">{t.manageSubjects.selectClassFirst}</p>
              ) : !selectedClassSection && availableSections.length > 0 ? (
                <p className="text-sm text-slate-500">{t.manageSubjects.chooseSection}</p>
              ) : selectedClassSubjects.length === 0 ? (
                <p className="text-sm text-slate-500">{t.manageSubjects.noSubjects}</p>
              ) : (
                selectedClassSubjects.map((subject) => (
                  <div key={subject.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    {editSubjectId === subject.id ? (
                      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
                        <Input
                          label={t.manageSubjects.name}
                          value={editSubjectForm.name}
                          onChange={onEditSubjectFormChange('name')}
                          className="h-10"
                        />
                        <Input
                          label={t.manageSubjects.code}
                          value={editSubjectForm.code}
                          onChange={onEditSubjectFormChange('code')}
                          className="h-10"
                        />
                        <button
                          type="button"
                          onClick={() => onSaveSubject(subject.id)}
                          disabled={savingSubject}
                          className="mt-7 h-10 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingSubject ? t.edit.saving : t.edit.save}
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEditSubject}
                          className="mt-7 h-10 rounded-md border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {t.delete.cancel}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{subject.name}</span>
                          {subject.code ? ` (${subject.code})` : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onStartEditSubject(subject)}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            {t.edit.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(subject.id)}
                            disabled={deletingSubjectId === subject.id}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingSubjectId === subject.id ? t.delete.deleting : t.delete.delete}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {deleteClassTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{t.delete.confirmClass}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.delete.textPrefix}{' '}
              <span className="font-semibold text-slate-900">{formatClassLabel(deleteClassTarget, t.placeholders.class)}</span>{' '}
              {t.delete.textMid}
            </p>

            <input
              type="text"
              value={typedClassLabel}
              onChange={(event) => setTypedClassLabel(event.target.value)}
              placeholder={t.delete.enterClass}
              className="mt-3 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteClassTarget(null);
                  setTypedClassLabel('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t.delete.cancel}
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteClass}
                disabled={
                  deletingClassId === String(deleteClassTarget._id) ||
                  !isConfirmationLabelMatch(typedClassLabel, formatClassLabel(deleteClassTarget, t.placeholders.class))
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingClassId === String(deleteClassTarget._id) ? t.delete.deleting : t.delete.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}