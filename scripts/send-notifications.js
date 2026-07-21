const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendToAll({ title, body, statusId }) {
  const installsSnap = await db.collection('installs').get();
  const tokens = installsSnap.docs
    .filter(d => !d.data().blocked)
    .map(d => d.data().fcmToken)
    .filter(Boolean);

  console.log(`Sending "${title}" to ${tokens.length} device(s)...`);

  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data: { statusId: statusId || '' },
        android: { priority: 'high' }
      });
    } catch (e) {
      console.error(`Failed to send to a device: ${e.message}`);
    }
  }
}

async function main() {
  const now = Date.now();

  const newStatusSnap = await db.collection('status')
    .where('notified', '==', false)
    .get();

  for (const doc of newStatusSnap.docs) {
    await sendToAll({
      title: 'New update just posted!',
      body: 'Tap to view — it disappears in 24 hours.',
      statusId: doc.id
    });
    await doc.ref.update({ notified: true });
  }

  const reminderSnap = await db.collection('status')
    .where('reminderSent', '==', false)
    .get();

  for (const doc of reminderSnap.docs) {
    const s = doc.data();
    if (!s.reminderTime) continue;
    const remMs = s.reminderTime.toMillis ? s.reminderTime.toMillis() : s.reminderTime;
    if (remMs <= now && remMs > now - 10 * 60000) {
      await sendToAll({
        title: 'Reminder — last chance!',
        body: 'Tap to view this before it disappears.',
        statusId: doc.id
      });
      await doc.ref.update({ reminderSent: true });
    }
  }

  console.log('Done.');
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
