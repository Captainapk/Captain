const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendToAll({ title, body, statusId, quizId }) {
  const installsSnap = await db.collection('installs').get();
  const tokens = installsSnap.docs
    .filter(d => !d.data().blocked)
    .map(d => d.data().fcmToken)
    .filter(Boolean);

  console.log(`Sending "${title}" to ${tokens.length} device(s)...`);

  const data = {};
  if (statusId) data.statusId = statusId;
  if (quizId) data.quizId = quizId;

  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data,
        android: { priority: 'high' }
      });
    } catch (e) {
      console.error(`Failed to send to a device: ${e.message}`);
    }
  }
}

async function scoreQuizzes() {
  const quizzesSnap = await db.collection('quizzes').where('pointsAwarded', '==', false).get();

  for (const quizDoc of quizzesSnap.docs) {
    const quiz = quizDoc.data();
    if (quiz.correctAnswerIndex === null || quiz.correctAnswerIndex === undefined) continue;

    console.log(`Scoring quiz: "${quiz.question}"`);
    const answersSnap = await db.collection('quiz_answers').where('quizId', '==', quizDoc.id).get();

    let correctCount = 0, incorrectCount = 0;
    for (const answerDoc of answersSnap.docs) {
      const answer = answerDoc.data();
      if (answer.selectedAnswerIndex !== quiz.correctAnswerIndex) {
        incorrectCount++;
        continue;
      }
      correctCount++;
      try {
        const batch = db.batch();
        batch.set(db.collection('registered_phones').doc(answer.phone), {
          walletBalance: admin.firestore.FieldValue.increment(quiz.points)
        }, { merge: true });
        batch.set(db.collection('wallet_transactions').doc(), {
          uid: '', name: answer.name || '', phone: answer.phone,
          amount: quiz.points, type: 'quiz_reward',
          description: `Correct answer: "${quiz.question}"`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();

        const matching = await db.collection('installs').where('phone', '==', answer.phone).get();
        if (!matching.empty) {
          const installBatch = db.batch();
          matching.docs.forEach(d => {
            installBatch.set(d.ref, { walletBalance: admin.firestore.FieldValue.increment(quiz.points) }, { merge: true });
          });
          await installBatch.commit();
        }
      } catch (e) {
        console.error(`Failed to award points to ${answer.phone}: ${e.message}`);
      }
    }

    await quizDoc.ref.update({ pointsAwarded: true, scoredAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Quiz scored: ${correctCount} correct, ${incorrectCount} incorrect`);
  }
}

async function main() {
  const now = Date.now();

  // 1. Notify as soon as possible about newly added status photos
  const newStatusSnap = await db.collection('status')
    .where('notified', '==', false)
    .get();

  for (const doc of newStatusSnap.docs) {
    const s = doc.data();
    await sendToAll({
      title: s.notifyTitle || 'New update just posted!',
      body: s.notifyBody || 'Tap to view — it disappears in 24 hours.',
      statusId: doc.id
    });
    await doc.ref.update({ notified: true });
  }

  // 2. Send a reminder at the exact time the admin chose
  const reminderSnap = await db.collection('status')
    .where('reminderSent', '==', false)
    .get();

  for (const doc of reminderSnap.docs) {
    const s = doc.data();
    if (!s.reminderTime) continue;
    const remMs = s.reminderTime.toMillis ? s.reminderTime.toMillis() : s.reminderTime;
    if (remMs <= now && remMs > now - 10 * 60000) {
      await sendToAll({
        title: s.notifyTitle ? `Reminder: ${s.notifyTitle}` : 'Reminder — last chance!',
        body: s.notifyBody || 'Tap to view this before it disappears.',
        statusId: doc.id
      });
      await doc.ref.update({ reminderSent: true });
    }
  }

  // 3. Score any quiz that has a correct answer set but hasn't paid out yet
  await scoreQuizzes();

  // 4. Notify about newly published quizzes
  const newQuizSnap = await db.collection('quizzes').where('notified', '==', false).get();
  for (const doc of newQuizSnap.docs) {
    const q = doc.data();
    await sendToAll({
      title: '🧩 New quiz just posted!',
      body: `${q.question} — answer now to win ₹${q.points}!`,
      quizId: doc.id
    });
    await doc.ref.update({ notified: true });
  }

  console.log('Done.');
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
