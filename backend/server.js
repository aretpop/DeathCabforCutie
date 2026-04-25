require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

try {
  admin.initializeApp({
    credential: admin.credential.cert(require('./firebase-service-account.json'))
  });
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Firebase Admin initialization failed:', error.message);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// POST /register-token
app.post('/register-token', async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) {
    return res.status(400).json({ error: 'Missing userId or token' });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ fcm_token: token })
    .eq('id', userId);

  if (error) {
    console.error('Error saving token:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ message: 'Token registered successfully' });
});

// Mock function to send push notification
async function sendPushNotification(token, title, body, data = {}) {
  if (!token) return;
  const message = {
    token,
    notification: { title, body },
    data
  };
  
  console.log('Sending notification:', message);
  
  try {
    await admin.messaging().send(message);
    console.log('Notification sent via Firebase to', token);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

// 1. New Ride Created (listen to inserts on rides table)
// Note: In real production, it's better to use Supabase Webhooks to call this API, 
// or Realtime subscriptions.
const setupRealtime = () => {
  supabase
    .channel('rides-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, async (payload) => {
      console.log('New ride created:', payload.new);
      const ride = payload.new;
      
      // Notify relevant drivers
      const { data: drivers } = await supabase.from('users').select('id, fcm_token').eq('role', 'driver');
      
      if (drivers) {
        for (const driver of drivers) {
          if (driver.fcm_token) {
            sendPushNotification(driver.fcm_token, "New Ride Available", `Ride from ${ride.pickup_location} to ${ride.dropoff_location}`, { rideId: ride.id.toString(), type: 'new_ride' });
          }
        }
      }
    })
    .subscribe();

  // 3. New Chat Message
  supabase
    .channel('chat-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
      console.log('New chat message:', payload.new);
      const msg = payload.new;
      
      // Fetch ride to get all participants (driver + riders)
      const { data: ride } = await supabase.from('rides').select('driver_id').eq('id', msg.ride_id).single();
      const { data: requests } = await supabase.from('ride_requests').select('user_id').eq('ride_id', msg.ride_id).eq('status', 'accepted');
      
      let participants = [];
      if (ride?.driver_id) participants.push(ride.driver_id);
      if (requests) participants.push(...requests.map(r => r.user_id));
      
      // Remove the sender
      participants = participants.filter(id => id !== msg.sender_id);
      
      if (participants.length > 0) {
        const { data: users } = await supabase.from('users').select('id, fcm_token').in('id', participants);
        if (users) {
          for (const user of users) {
            if (user.fcm_token) {
              // Notification will only be shown if chat is not open on client side
              sendPushNotification(user.fcm_token, "New Message", msg.content, { rideId: msg.ride_id.toString(), type: 'new_message' });
            }
          }
        }
      }
    })
    .subscribe();
};
setupRealtime();

// 2. 5-Minute Reminder (CRON)
// Run every minute to check for rides starting in 5 mins
cron.schedule('* * * * *', async () => {
  console.log('Running cron for upcoming rides...');
  const now = new Date();
  const fiveMinsFromNow = new Date(now.getTime() + 5 * 60000);
  const sixMinsFromNow = new Date(now.getTime() + 6 * 60000); // 1 minute window
  
  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, driver_id, departure_time, pickup_location, dropoff_location')
    .gte('departure_time', fiveMinsFromNow.toISOString())
    .lt('departure_time', sixMinsFromNow.toISOString());

  if (rides && rides.length > 0) {
    for (const ride of rides) {
      // Check if reminder already sent to avoid duplicates (assuming we have a log or flag)
      // For simplicity, we just send it if it falls in the minute window
      
      // Notify driver
      if (ride.driver_id) {
        const { data: driver } = await supabase.from('users').select('fcm_token').eq('id', ride.driver_id).single();
        if (driver?.fcm_token) {
          sendPushNotification(driver.fcm_token, "Ride starting soon!", `Your ride to ${ride.dropoff_location} starts in 5 minutes.`, { rideId: ride.id.toString(), type: 'ride_reminder' });
        }
      }

      // Notify riders
      const { data: requests } = await supabase.from('ride_requests').select('user_id').eq('ride_id', ride.id).eq('status', 'accepted');
      if (requests && requests.length > 0) {
        const riderIds = requests.map(r => r.user_id);
        const { data: riders } = await supabase.from('users').select('fcm_token').in('id', riderIds);
        if (riders) {
          for (const rider of riders) {
            if (rider.fcm_token) {
              sendPushNotification(rider.fcm_token, "Ride starting soon!", `Your ride from ${ride.pickup_location} starts in 5 minutes.`, { rideId: ride.id.toString(), type: 'ride_reminder' });
            }
          }
        }
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
