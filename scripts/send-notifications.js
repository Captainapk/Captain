const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendToAll({ title, body, promoId }) {
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
        data: { promoId: promoId || '' },
        android: { priority: 'high' }
      });
    } catch (e) {
      console.error(`Failed to send to a device: ${e.message}`);
    }
  }
}

async function main() {
  const now = Date.now();

  const newPromosSnap = await db.collection('promotions')
    .where('active', '==', true)
    .where('notified', '==', false)
    .get();

  for (const doc of newPromosSnap.docs) {
    const promo = doc.data();
    await sendToAll({
      title: `New offer: ${promo.title || 'Check it out'}`,
      body: promo.badge ? `${promo.badge} — tap to view and claim` : 'Tap to view and claim',
      promoId: doc.id
    });
    await doc.ref.update({ notified: true });
  }

  const upcomingSnap = await db.collection('promotions')
    .where('active', '==', true)
    .where('reminderSent', '==', false)
    .get();

  for (const doc of upcomingSnap.docs) {
    const promo = doc.data();
    if (!promo.startTime) continue;
    const startMs = promo.startTime.toMillis ? promo.startTime.toMillis() : promo.startTime;
    const minsUntil = (startMs - now) / 60000;
    if (minsUntil <= 35 && minsUntil > 20) {
      await sendToAll({
        title: 'Last chance to join!',
        body: `${promo.title || 'This offer'} starts in 30 minutes — don't miss out.`,
        promoId: doc.id
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
