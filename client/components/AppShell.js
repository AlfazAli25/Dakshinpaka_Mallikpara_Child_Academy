'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { get, post } from '@/lib/api';
import { clearSession, getToken, getUser } from '@/lib/session';

export default function AppShell({ title, links, children, sidebarExtra = null }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [markingReadId, setMarkingReadId] = useState('');
  const [user, setUser] = useState(null);
  const notifPanelRef = useRef(null);
  const notifButtonRef = useRef(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

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

  return (
    <div className="min-h-screen bg-[#f8f7f7]">
      <div className="sticky top-0 z-30 border-b border-red-900 bg-gradient-to-r from-red-800 via-red-700 to-red-800 px-4 py-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/45 bg-white/10 text-white hover:bg-white/20 md:hidden"
              aria-label="Open navigation"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            <Link
              href="/"
              className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/45 bg-white/10 hover:bg-white/20"
              aria-label="Go to public homepage"
              title="Public homepage"
            >
              <img src="/School_Logo.png" alt="School Logo" className="h-9 w-9 object-contain" />
            </Link>
          </div>

          <div className="flex items-center gap-2">

            {user?.role === 'admin' && (
              <div className="relative">
                <button
                  ref={notifButtonRef}
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/45 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 17h5l-1.4-1.4a2 2 0 01-.6-1.4V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5" />
                    <path d="M9 17a3 3 0 006 0" />
                  </svg>
                  <span>{unreadCount > 0 ? `${unreadCount} Unread` : 'Notifications'}</span>
                </button>

                {notifOpen && (
                  <div
                    ref={notifPanelRef}
                    className="fixed inset-x-3 top-[4.4rem] z-50 flex max-h-[72vh] flex-col rounded-xl border border-red-100 bg-white p-2 shadow-xl sm:absolute sm:right-0 sm:top-12 sm:inset-x-auto sm:w-80 sm:max-h-[24rem]"
                  >
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Payment Alerts</p>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 sm:hidden"
                        aria-label="Close notifications"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-500">No notifications.</p>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item._id}
                            type="button"
                            onClick={() => onNotificationClick(item)}
                            disabled={markingReadId === item._id}
                            className={`block rounded-lg px-2 py-2 text-sm hover:bg-red-50 ${
                              item.status === 'UNREAD' ? 'bg-red-50 text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            <p className="break-words font-semibold">{item.title || 'Notification'}</p>
                            <p className="break-words text-xs text-slate-600">{item.message || '-'}</p>
                            <p className="text-xs text-slate-500">{new Date(item.submittedAt).toLocaleString('en-GB')}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {user && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-10 items-center rounded-lg border border-white/45 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-50"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-65px)]">
        <Sidebar
          title={title}
          links={links}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          extraContent={sidebarExtra}
        />
        <main className="smooth-enter w-full flex-1 overflow-x-hidden p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}