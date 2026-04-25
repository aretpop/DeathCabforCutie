import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    
    // Only run on iOS/Android devices
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications are ignored on web.');
      return;
    }

    const registerPush = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission denied');
          return;
        }

        await PushNotifications.register();
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    registerPush();

    const addListeners = async () => {
      // 1. On success, we receive a token
      await PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, FCM token:', token.value);
        
        // Save the token to Supabase `users` table
        // (If we were using the Node API, we would POST to /register-token here)
        const { error } = await supabase
          .from('users')
          .update({ fcm_token: token.value })
          .eq('id', user.id);
          
        if (error) {
          console.error('Error saving FCM token:', error.message);
        }
      });

      // 2. On error getting token
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error: ', JSON.stringify(error));
      });

      // 3. Notification received while app is OPEN
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received in foreground: ', notification);
        // Supabase realtime in NotificationContext handles the UI toast for open app,
        // so we don't necessarily need to show an extra alert here.
      });

      // 4. User clicked the notification (app in background or closed)
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push action performed: ', notification);
        const data = notification.notification.data;
        
        // Deep linking: Open the specific ride or chat
        if (data && data.rideId) {
          navigate(`/ride/${data.rideId}`);
        }
      });
    };

    addListeners();

    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, [user, navigate]);
}
