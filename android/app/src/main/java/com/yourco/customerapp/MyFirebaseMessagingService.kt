package com.yourco.customerapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        prefs.edit()
            .putString("fcm_token", token)
            .putBoolean("fcm_token_pending", true)
            .apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title ?: message.data["title"] ?: "New update"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        val promoId = message.data["promoId"]

        val channelId = "promotions_channel"
        val nm = getSystemService(NotificationManager::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Promotions & Updates",
                NotificationManager.IMPORTANCE_HIGH
            )
            channel.description = "Alerts about new offers and updates"
            nm.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        if (promoId != null) intent.putExtra("promoId", promoId)

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.notification_color))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        nm.notify(System.currentTimeMillis().toInt(), builder.build())
    }
}
