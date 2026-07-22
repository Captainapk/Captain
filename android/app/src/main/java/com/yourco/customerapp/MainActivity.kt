package com.yourco.customerapp

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.firebase.messaging.FirebaseMessaging
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout

    private val baseUrl = "https://captaininida.app/"

    private var webViewReady = false
    private var pendingToken: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)

        askNotificationPermission()

        val installId = getOrCreateInstallId()

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.setBackgroundColor(android.graphics.Color.parseColor("#0F0D0A"))

        webView.webViewClient = object : WebViewClient() {

            @Deprecated("Deprecated in Java, kept for broad API-level compatibility")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                return if (url.startsWith(baseUrl)) {
                    false
                } else {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "Couldn't open that link", Toast.LENGTH_SHORT).show()
                    }
                    true
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
                webViewReady = true
                trySyncToken(installId)
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }

        val statusId = intent.getStringExtra("statusId")
        var urlWithId = "$baseUrl?uid=$installId&src=app"
        if (statusId != null) urlWithId += "&status=$statusId"
        webView.loadUrl(urlWithId)

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
                prefs.edit().putString("fcm_token", token).apply()
                pendingToken = token
                trySyncToken(installId)
            }
        }
    }

    private fun trySyncToken(installId: String) {
        val token = pendingToken
        if (webViewReady && token != null) {
            val js = "if (window.saveFcmToken) { window.saveFcmToken('$installId', '$token'); }"
            webView.evaluateJavascript(js, null)
            pendingToken = null
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
    }

    private fun getOrCreateInstallId(): String {
        val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        var id = prefs.getString("install_id", null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("install_id", id).apply()
        }
        return id
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
