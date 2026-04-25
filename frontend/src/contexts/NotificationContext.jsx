import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const NotificationContext = createContext({})

export function NotificationProvider({ children }) {
  const { user, role } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState([])           // { id, title, message, type, ride_id }
  const fetchedRef = useRef(false)
  const channelRef = useRef(null)

  // ── Helpers ───────────────────────────────────────────────
  const pushToast = (notif) => {
    const toast = {
      id:      notif.id,
      title:   notif.title,
      message: notif.message,
      type:    notif.type,
      ride_id: notif.ride_id,
    }
    setToasts(prev => [toast, ...prev].slice(0, 5)) // max 5 visible at once
    // Auto-dismiss after 6 s (ride reminders get 8 s)
    const delay = notif.type === 'RIDE_REMINDER' ? 8000 : 5000
    setTimeout(() => dismissToast(toast.id), delay)

    // Bonus: Vibrate on new message (if supported)
    if (notif.type === 'NEW_MESSAGE' && typeof window !== 'undefined' && window.navigator?.vibrate) {
      try {
        window.navigator.vibrate([100, 50, 100])
      } catch(e) { /* ignore */ }
    }
  }

  const dismissToast = (toastId) => {
    setToasts(prev => prev.filter(t => t.id !== toastId))
  }

  // ── Fetch all notifications for current user ──────────────
  const fetchNotifications = async (userId) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.is_read).length)
    }
  }

  // ── Mark single notification as read ─────────────────────
  const markRead = async (notifId) => {
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId)
  }

  // ── Mark all as read ──────────────────────────────────────
  const markAllRead = async () => {
    if (!user?.id) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id)
  }

  // ── Chat-specific helpers ─────────────────────────────────
  const getUnreadChatCount = (rideId) => {
    return notifications.filter(n => n.type === 'NEW_MESSAGE' && n.ride_id === rideId && !n.is_read).length
  }

  const markChatRead = async (rideId) => {
    if (!user?.id) return
    const unread = notifications.filter(n => n.type === 'NEW_MESSAGE' && n.ride_id === rideId && !n.is_read)
    if (unread.length === 0) return

    setNotifications(prev => prev.map(n => 
      (n.type === 'NEW_MESSAGE' && n.ride_id === rideId) ? { ...n, is_read: true } : n
    ))
    setUnreadCount(prev => Math.max(0, prev - unread.length))

    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('ride_id', rideId)
      .eq('type', 'NEW_MESSAGE')
  }

  // ── Delete single notification ────────────────────────────
  const deleteNotification = async (notifId) => {
    const target = notifications.find(n => n.id === notifId)
    setNotifications(prev => prev.filter(n => n.id !== notifId))
    if (target && !target.is_read) setUnreadCount(prev => Math.max(0, prev - 1))
    await supabase.from('notifications').delete().eq('id', notifId)
  }

  // ── Init: fetch + realtime ────────────────────────────────
  // Works for BOTH students and drivers — drivers get NEW_RIDE + RIDE_REMINDER
  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      setUnreadCount(0)
      fetchedRef.current = false
      return
    }

    const userId = user.id

    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchNotifications(userId)
    }

    // Cleanup previous channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new
          setNotifications(prev => [newNotif, ...prev])
          setUnreadCount(prev => prev + 1)
          pushToast(newNotif)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          )
          // Recount from source
          setNotifications(prev => {
            setUnreadCount(prev.filter(n => !n.is_read).length)
            return prev
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id))
          setNotifications(prev => {
            setUnreadCount(prev.filter(n => !n.is_read).length)
            return prev
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      fetchedRef.current = false
    }
  }, [user?.id])

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      toasts,
      markRead,
      markAllRead,
      deleteNotification,
      dismissToast,
      getUnreadChatCount,
      markChatRead,
      refetch: () => user?.id && fetchNotifications(user.id),
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
