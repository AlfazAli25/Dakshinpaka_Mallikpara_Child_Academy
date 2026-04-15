'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronRight, Loader2, LogOut, Menu, ShieldCheck } from 'lucide-react';
import Sidebar from './Sidebar';
import ThemeToggle from '@/components/ui/theme-toggle';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/language-context';
import { get, getBlob, post } from '@/lib/api';
import { clearSession, getToken, getUser } from '@/lib/session';

const shellText = {
  en: {
    home: 'Home',
    profile: 'Profile',
    workspace: 'Workspace',
    alerts: 'Alerts',
    paymentAlerts: 'Payment Alerts',
    noNotifications: 'No notifications.',
    logout: 'Logout',
    account: 'Account',
    adminPanel: 'Admin Panel',
    teacherPanel: 'Teacher Panel',
    studentPanel: 'Student Panel'
  },
  bn: {
    home: 'হোম',
    profile: 'প্রোফাইল',
    workspace: 'ওয়ার্কস্পেস',
    alerts: 'অ্যালার্টস',
    paymentAlerts: 'পেমেন্ট অ্যালার্টস',
    noNotifications: 'কোনো অ্যালার্ট নেই।',
    logout: 'লগআউট',
    account: 'অ্যাকাউন্ট',
    adminPanel: 'অ্যাডমিন প্যানেল',
    teacherPanel: 'শিক্ষক প্যানেল',
    studentPanel: 'শিক্ষার্থী প্যানেল'
  }
};

const DESKTOP_SIDEBAR_STATE_KEY = 'app-shell-desktop-sidebar-open';
const ParticlesBackground3D = dynamic(() => import('@/components/animations/ParticlesBackground3D'), {
  ssr: false
});

const toTitleCase = (value = '') =>
  String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatRole = (role = '') => {
  if (!role) {
    return 'User';
  }

  return toTitleCase(role);
};

export default function AppShell({ title, links, children, sidebarExtra = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = shellText[language] || shellText.en;
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    try {
      return window.localStorage.getItem(DESKTOP_SIDEBAR_STATE_KEY) !== '0';
    } catch (_error) {
      return true;
    }
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [markingReadId, setMarkingReadId] = useState('');
  const [user, setUser] = useState(null);
  const [studentIdCardOpen, setStudentIdCardOpen] = useState(false);
  const [studentIdCardLoading, setStudentIdCardLoading] = useState(false);
  const [studentIdCardError, setStudentIdCardError] = useState('');
  const [studentIdCardPreviewUrl, setStudentIdCardPreviewUrl] = useState('');
  const notifPanelRef = useRef(null);
  const notifButtonRef = useRef(null);

  const activePageLabel = useMemo(() => {
    const segments = String(pathname || '')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) {
      return 'Home';
    }

    const lastSegment = segments[segments.length - 1] || 'Dashboard';

    // If the last segment looks like a MongoDB ObjectID (24 hex chars)
    // or any raw ID / slug that starts with a digit, show "Profile" instead.
    const isRawId = /^[a-f0-9]{24}$/i.test(lastSegment) || /^\d+$/.test(lastSegment);
    if (isRawId) {
      return 'Profile';
    }

    // If the segment is a Next.js dynamic route placeholder like [studentId], strip the brackets.
    const cleaned = lastSegment.replace(/^\[|\]$/g, '');
    const mappedLabel = toTitleCase(cleaned);
    
    // Attempt to map to Bengali text if applicable
    const token = mappedLabel.toLowerCase();
    if (token === 'dashboard') return language === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard';
    if (token === 'students') return language === 'bn' ? 'শিক্ষার্থী' : 'Students';
    if (token === 'teachers') return language === 'bn' ? 'শিক্ষক' : 'Teachers';
    if (token === 'classes') return language === 'bn' ? 'ক্লাস' : 'Classes';
    if (token === 'notices') return language === 'bn' ? 'নোটিশ' : 'Notices';
    if (token === 'timetable') return language === 'bn' ? 'সময়সূচী' : 'Timetable';
    if (token === 'exams') return language === 'bn' ? 'পরীক্ষা' : 'Exams';
    if (token === 'marks') return language === 'bn' ? 'নম্বর' : 'Marks';
    if (token === 'fees') return language === 'bn' ? 'ফি' : 'Fees';
    if (token === 'results') return language === 'bn' ? 'ফলাফল' : 'Results';
    if (token === 'attendance') return language === 'bn' ? 'উপস্থিতি' : 'Attendance';
    
    return mappedLabel;
  }, [pathname, language]);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setDesktopSidebarOpen((prev) => !prev);
      return;
    }

    setMobileOpen((prev) => !prev);
  };

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_SIDEBAR_STATE_KEY, desktopSidebarOpen ? '1' : '0');
    } catch (_error) {
      // Ignore localStorage failures (private mode or blocked storage).
    }
  }, [desktopSidebarOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }

    let active = true;
    const loadNotifications = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      try {
        const response = await get('/notifications/admin', getToken(), {
          forceRefresh: true,
          cacheTtlMs: 0
        });
        if (active) {
          setNotifications(response.data?.notifications || []);
        }
      } catch (_error) {
        if (active) {
          setNotifications([]);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    };

    loadNotifications();
    const timer = setInterval(loadNotifications, 15000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!notifOpen) {
      return;
    }

    const onPointerDown = (event) => {
      const panelElement = notifPanelRef.current;
      const buttonElement = notifButtonRef.current;
      const target = event.target;

      if (panelElement?.contains(target) || buttonElement?.contains(target)) {
        return;
      }

      setNotifOpen(false);
    };

    const onEscapePress = (event) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscapePress);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscapePress);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!studentIdCardOpen) {
      return;
    }

    const onEscapePress = (event) => {
      if (event.key === 'Escape') {
        setStudentIdCardOpen(false);
      }
    };

    document.addEventListener('keydown', onEscapePress);
    return () => {
      document.removeEventListener('keydown', onEscapePress);
    };
  }, [studentIdCardOpen]);

  useEffect(
    () => () => {
      if (studentIdCardPreviewUrl) {
        URL.revokeObjectURL(studentIdCardPreviewUrl);
      }
    },
    [studentIdCardPreviewUrl]
  );

  const unreadCount = notifications.filter((item) => item.status === 'UNREAD').length;

  const markRead = async (notification) => {
    const notificationId = String(notification?._id || '').trim();
    if (!notificationId) {
      return false;
    }

    if (String(notification?.status || '').toUpperCase() === 'READ') {
      return true;
    }

    const previousStatus = notification?.status;
    const previousReadAt = notification?.readAt;

    setNotifications((prev) =>
      prev.map((item) =>
        item._id === notificationId
          ? { ...item, status: 'READ', readAt: new Date().toISOString() }
          : item
      )
    );

    setMarkingReadId(notificationId);

    try {
      await post(`/notifications/${notificationId}/read`, {}, getToken());
      return true;
    } catch (_error) {
      setNotifications((prev) =>
        prev.map((item) =>
          item._id === notificationId
            ? { ...item, status: previousStatus, readAt: previousReadAt }
            : item
        )
      );
      return false;
    } finally {
      setMarkingReadId('');
    }
  };

  const onNotificationClick = async (notification) => {
    if (!notification) {
      return;
    }

    setNotifOpen(false);
    await markRead(notification);

    const targetPath = String(notification.targetPath || '').trim();
    if (targetPath) {
      router.push(targetPath);
    }
  };

  const onLogout = () => {
    clearSession();
    setUser(null);
    router.push('/');
  };

  const openStudentIdCardPreview = async () => {
    if (user?.role !== 'student') {
      return;
    }

    setStudentIdCardOpen(true);
    setStudentIdCardError('');

    if (studentIdCardPreviewUrl || studentIdCardLoading) {
      return;
    }

    const token = getToken();
    if (!token) {
      setStudentIdCardError('Unable to load ID card right now.');
      return;
    }

    setStudentIdCardLoading(true);
    try {
      const previewImageBlob = await getBlob('/id-cards/student/me/preview', token, { timeoutMs: 120000 });
      const nextPreviewUrl = URL.createObjectURL(previewImageBlob);

      setStudentIdCardPreviewUrl((previousPreviewUrl) => {
        if (previousPreviewUrl) {
          URL.revokeObjectURL(previousPreviewUrl);
        }

        return nextPreviewUrl;
      });
    } catch (_error) {
      setStudentIdCardError('Unable to load ID card right now.');
    } finally {
      setStudentIdCardLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <ParticlesBackground3D className="opacity-45" />

      <div className="sticky top-0 z-30 border-b border-red-900/40 bg-gradient-to-r from-red-900/95 via-red-800/95 to-red-900/95 px-2 py-2 shadow-lg backdrop-blur md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4">
          <div className="flex min-w-0 items-center gap-1 md:gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/35 bg-white/10 text-white hover:bg-white/20"
              aria-label={desktopSidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
            >
              <Menu className="h-4.5 w-4.5" aria-hidden="true" />
            </button>

            <Link
              href="/"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/35 bg-white/95 shadow-sm"
              aria-label="Go to public homepage"
              title="Public homepage"
            >
              <img src="/School_Logo.png" alt="School Logo" className="h-9 w-9 rounded-lg object-contain" />
            </Link>

            <div className="min-w-0 max-w-[120px] sm:max-w-none">
              <p className="truncate text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-red-100/90">
                {title === 'Admin Panel' ? t.adminPanel : title === 'Teacher Panel' ? t.teacherPanel : title === 'Student Panel' ? t.studentPanel : title}
              </p>
              <p className="truncate text-xs sm:text-sm font-semibold text-white/95 md:text-base flex items-center">
                {activePageLabel}
                <span className="mx-1.5 inline-flex text-red-200/90">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {t.workspace}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 md:gap-3 w-full sm:w-auto justify-end">
            <LanguageToggle />
            <ThemeToggle />

            {user?.role === 'admin' ? (
              <div className="relative">
                <button
                  ref={notifButtonRef}
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  className="relative inline-flex h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.alerts}</span>
                  {unreadCount > 0 ? (
                    <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-red-700">
                      {unreadCount}
                    </span>
                  ) : null}
                </button>

                {notifOpen ? (
                  <div
                    ref={notifPanelRef}
                    className="fixed inset-x-3 top-[4.7rem] z-50 flex max-h-[72vh] flex-col rounded-2xl border border-red-100 bg-white/95 p-2 shadow-xl backdrop-blur sm:absolute sm:right-0 sm:top-12 sm:inset-x-auto sm:w-96 sm:max-h-[24rem] dark:border-red-400/20 dark:bg-slate-900/95"
                  >
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-200">{t.paymentAlerts}</p>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-red-400/30 dark:text-red-200 dark:hover:bg-slate-800 sm:hidden"
                        aria-label="Close notifications"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-500 dark:text-red-100/80">{t.noNotifications}</p>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item._id}
                            type="button"
                            onClick={() => onNotificationClick(item)}
                            disabled={markingReadId === item._id}
                            className={`block w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 ${
                              item.status === 'UNREAD'
                                ? 'bg-red-50 text-slate-900 dark:bg-red-900/20 dark:text-red-50'
                                : 'text-slate-700 dark:text-red-100'
                            }`}
                          >
                            <p className="break-words font-semibold">{item.title || 'Notification'}</p>
                            <p className="break-words text-xs text-slate-600 dark:text-red-100/80">{item.message || '-'}</p>
                            <p className="text-xs text-slate-500 dark:text-red-100/70">{new Date(item.submittedAt).toLocaleString('en-GB')}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {user?.role === 'student' ? (
              <button
                type="button"
                onClick={openStudentIdCardPreview}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/35 bg-white/10 text-white transition hover:bg-white/20 md:hidden"
                aria-label="Open student identity card"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}

            {user ? (
              user.role === 'student' ? (
                <button
                  type="button"
                  onClick={openStudentIdCardPreview}
                  className="hidden items-center rounded-xl border border-white/35 bg-white/10 px-3 py-1.5 text-white transition hover:bg-white/20 md:flex"
                  aria-label="Open student identity card"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-red-100/90">{formatRole(user.role)}</p>
                    <p className="max-w-[140px] truncate text-xs font-semibold text-white">{user.name || t.account}</p>
                  </div>
                </button>
              ) : (
                <div className="hidden items-center rounded-xl border border-white/35 bg-white/10 px-3 py-1.5 text-white md:flex">
                  <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-red-100/90">{formatRole(user.role)}</p>
                    <p className="max-w-[140px] truncate text-xs font-semibold text-white">{user.name || t.account}</p>
                  </div>
                </div>
              )
            ) : null}

            {user ? (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-white/35 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t.logout}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative flex h-[calc(100vh-76px)] min-h-0 overflow-hidden">
        <Sidebar
          title={title}
          links={links}
          mobileOpen={mobileOpen}
          desktopOpen={desktopSidebarOpen}
          onClose={() => setMobileOpen(false)}
          extraContent={sidebarExtra}
        />

        <main className="smooth-enter min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-7">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>

      {studentIdCardOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-sm"
          onClick={() => setStudentIdCardOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Student identity card preview"
        >
          <div
            className="h-[70vh] w-[70vw] overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
              <p className="text-sm font-semibold text-slate-700">Student ID Card</p>
              <button
                type="button"
                onClick={() => setStudentIdCardOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                aria-label="Close student ID card preview"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="h-[calc(70vh-44px)] w-full bg-white">
              {studentIdCardLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-500" aria-label="Loading student ID card" />
                </div>
              ) : studentIdCardError ? (
                <div className="flex h-full items-center justify-center px-4 text-center">
                  <p className="text-sm font-medium text-slate-600">{studentIdCardError}</p>
                </div>
              ) : studentIdCardPreviewUrl ? (
                <img
                  src={studentIdCardPreviewUrl}
                  alt="Student ID card preview"
                  className="h-full w-full bg-slate-100 object-contain"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
