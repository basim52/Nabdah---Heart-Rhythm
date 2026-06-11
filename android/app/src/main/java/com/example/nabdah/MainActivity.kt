package com.example.nabdah

import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private var gameView: GameView? = null
    private var onlineGameView: OnlineGameView? = null
    private var isMultiplayer = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Hide Status bars / Action Bar
        supportActionBar?.hide()
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            )
        }

        // Check if multiplayer was requested
        isMultiplayer = intent.getBooleanExtra("MULTIPLAYER_MODE", false)

        if (isMultiplayer) {
            onlineGameView = OnlineGameView(this)
            setContentView(onlineGameView)
        } else {
            gameView = GameView(this)
            setContentView(gameView)
        }
    }

    override fun onResume() {
        super.onResume()
        gameView?.resume()
        onlineGameView?.resume()
    }

    override fun onPause() {
        super.onPause()
        gameView?.pause()
        onlineGameView?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        gameView?.terminate()
        onlineGameView?.terminate()
    }
}
