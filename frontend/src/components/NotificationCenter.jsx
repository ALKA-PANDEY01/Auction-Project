import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getNotifications, markNotificationRead } from "../api/notification";
import { useAuth } from "../context/AuthContext";
import "./NotificationCenter.css";

function getWebSocketUrl() {
  const configuredApiBase = import.meta.env.VITE_API_BASE_URL || "/api";
  const apiBase = new URL(configuredApiBase, window.location.origin);
  apiBase.protocol = apiBase.protocol === "https:" ? "wss:" : "ws:";
  apiBase.pathname = `${apiBase.pathname.replace(/\/$/, "")}/notifications/ws`;
  apiBase.search = "";
  apiBase.hash = "";
  return apiBase.toString();
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function NotificationCenter() {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const reconnectTimer = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setToast(null);
      return undefined;
    }

    let disposed = false;
    let socket;
    let hasConnected = false;
    const loadNotifications = () => getNotifications()
      .then((items) => {
        if (!disposed) {
          setNotifications((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            items.forEach((item) => merged.set(item.id, item));
            return [...merged.values()]
              .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
              .slice(0, 50);
          });
          const unreadAlert = items.find((item) => (
            !item.is_read
            && (item.event_type === "wishlist_auction_started" || item.event_type === "auction_won" || item.event_type.startsWith("outbid_"))
          ));
          if (unreadAlert) setToast(unreadAlert);
        }
      })
      .catch(() => { if (!disposed) setError("Notifications are temporarily unavailable."); });

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(getWebSocketUrl());
      socket.addEventListener("open", () => {
        if (hasConnected) loadNotifications();
        hasConnected = true;
      });
      socket.addEventListener("message", (messageEvent) => {
        try {
          const event = JSON.parse(messageEvent.data);
          if (event.event !== "notification_created" || !event.notification) return;
          const notification = event.notification;
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
          setToast(notification);
          setError("");
          window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 9000);
        } catch (parseError) {
          console.error("Could not process notification WebSocket message", parseError);
        }
      });
      socket.addEventListener("close", () => {
        if (!disposed) reconnectTimer.current = window.setTimeout(connect, 3000);
      });
      socket.addEventListener("error", () => socket.close());
    };

    loadNotifications();
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer.current);
      window.clearTimeout(toastTimer.current);
      socket?.close();
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function openNotification(notification) {
    if (!notification.is_read) {
      try {
        const updated = await markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      } catch {
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      }
    }
    setToast(null);
    setIsOpen(false);
  }

  return (
    <aside className="notification-center" aria-label="Notifications">
      {toast && !isOpen && (
        <div className="notification-toast" role="status">
          <span className="notification-toast-icon" aria-hidden="true">!</span>
          <div><strong>{toast.title}</strong><p>{toast.message}</p>{toast.auction_id && <Link to={`/auctions/${toast.auction_id}`} onClick={() => openNotification(toast)}>View auction</Link>}</div>
          <button type="button" className="notification-toast-dismiss" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
        </div>
      )}
      <button className={`notification-bell${unreadCount ? " has-unread" : ""}`} type="button" onClick={() => { setIsOpen((open) => !open); setToast(null); }} aria-expanded={isOpen} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
        <span aria-hidden="true">♢</span><span>Notifications</span>{unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
      </button>
      {isOpen && (
        <section className="notification-panel" aria-label="Your notifications">
          <header><div><strong>Your notifications</strong><span>{unreadCount ? `${unreadCount} new` : "All caught up"}</span></div><button type="button" onClick={() => setIsOpen(false)} aria-label="Close notifications">×</button></header>
          {error && <p className="notification-panel-error" role="alert">{error}</p>}
          {notifications.length === 0 ? <p className="notification-empty">Auction updates will show up here.</p> : (
            <ul>
              {notifications.map((notification) => (
                <li className={notification.is_read ? "" : "is-unread"} key={notification.id}>
                  {notification.auction_id ? (
                    <Link to={`/auctions/${notification.auction_id}`} onClick={() => openNotification(notification)}>
                      <span className="notification-item-title">{notification.title}</span><span>{notification.message}</span><time>{formatNotificationDate(notification.created_at)}</time>
                    </Link>
                  ) : (
                    <div><span className="notification-item-title">{notification.title}</span><span>{notification.message}</span><time>{formatNotificationDate(notification.created_at)}</time></div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}
