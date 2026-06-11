package com.example.nabdah

import android.content.Context
import android.graphics.*
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import kotlin.math.*

class OnlineGameView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : SurfaceView(context, attrs, defStyleAttr), SurfaceHolder.Callback, Runnable, MultiplayerManager.MultiplayerCallback {

    private var gameThread: Thread? = null
    private var isPlaying = false
    private val holder: SurfaceHolder = getHolder().apply { addCallback(this@OnlineGameView) }

    // Multi-player State specs
    private val mpManager = MultiplayerManager.getInstance(context)
    private var isHost = false
    
    // Core state
    private var score = 0
    private var heartHP = 100
    private var currentBPM = Constants.DEFAULT_BPM
    private val enemies = ArrayList<SyncEnemy>()
    
    // Render variables
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var centerX = 0f
    private var centerY = 0f
    private var heartScale = 1.0f
    private var lastBeatTime = System.currentTimeMillis()

    // Sound
    private var soundPool: SoundPool? = null
    private var soundBeat = 0
    private var soundHit = 0
    private var soundPerfect = 0
    private var soundDamage = 0

    init {
        setupSounds()
        mpManager.setListener(this)
        isHost = mpManager.isHost
    }

    private fun setupSounds() {
        val attr = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        soundPool = SoundPool.Builder().setMaxStreams(5).setAudioAttributes(attr).build()
        soundBeat = soundPool?.load(context, context.resources.getIdentifier("heartbeat", "raw", context.packageName), 1) ?: 0
        soundHit = soundPool?.load(context, context.resources.getIdentifier("hit_sound", "raw", context.packageName), 1) ?: 0
        soundPerfect = soundPool?.load(context, context.resources.getIdentifier("perfect_sound", "raw", context.packageName), 1) ?: 0
        soundDamage = soundPool?.load(context, context.resources.getIdentifier("damage_sound", "raw", context.packageName), 1) ?: 0
    }

    fun resume() {
        isPlaying = true
        gameThread = Thread(this).apply { start() }
    }

    fun pause() {
        isPlaying = false
        try {
            gameThread?.join()
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    fun terminate() {
        soundPool?.release()
        soundPool = null
        mpManager.removeListener()
        mpManager.disconnect()
    }

    override fun surfaceCreated(holder: SurfaceHolder) {}
    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        centerX = width / 2f
        centerY = height / 2f
    }
    override fun surfaceDestroyed(holder: SurfaceHolder) {
        pause()
    }

    override fun run() {
        while (isPlaying) {
            val startTime = System.currentTimeMillis()
            updateOnlineState()
            renderOnlineCanvas()

            val elapsedTime = System.currentTimeMillis() - startTime
            val sleepTime = Constants.MILLIS_PER_FRAME - elapsedTime
            if (sleepTime > 0) {
                try {
                    Thread.sleep(sleepTime)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    private fun updateOnlineState() {
        val now = System.currentTimeMillis()
        val msPerBeat = 60000 / currentBPM

        // Beat schedule sync
        if (now - lastBeatTime > msPerBeat) {
            lastBeatTime = now
            heartScale = 1.25f
            playSound(soundBeat)
            
            // Host coordinates dynamic BPM speedup
            if (isHost) {
                currentBPM = min(144, 72 + (score / 300) * 4)
                mpManager.broadcastMessage(GameMessage(
                    type = Constants.MSG_BEAT_TRIGGER,
                    senderName = mpManager.localPlayerName,
                    score = score
                ))
            }
        } else {
            heartScale = max(1.0f, heartScale - 0.02f)
        }

        // Host ONLY generates spawns and reports to Client
        if (isHost) {
            val spawnInterval = max(700L, 2200L - (score / 4))
            if (enemies.isEmpty() || (now % spawnInterval < Constants.MILLIS_PER_FRAME)) {
                val threatId = Math.random().toString().substring(2, 8)
                val randomAngle = (Math.random() * PI * 2).toFloat()
                
                spawnHostEnemy(threatId, randomAngle)
                
                mpManager.broadcastMessage(GameMessage(
                    type = Constants.MSG_SPAWN_THREAT,
                    senderName = mpManager.localPlayerName,
                    threatId = threatId,
                    angle = randomAngle
                ))
            }
        }

        // Advance enemy positions
        val iterator = enemies.iterator()
        while (iterator.hasNext()) {
            val enemy = iterator.next()
            enemy.move(centerX, centerY)

            val dist = sqrt((enemy.x - centerX).pow(2) + (enemy.y - centerY).pow(2))
            if (dist < 60) {
                if (isHost) {
                    dealDamage(enemy)
                }
                iterator.remove()
            }
        }
    }

    private fun spawnHostEnemy(id: String, angle: Float) {
        val startRadius = min(centerX, centerY) * 0.95f
        val sx = centerX + startRadius * cos(angle)
        val sy = centerY + startRadius * sin(angle)
        
        val type = if (score > 400 && Math.random() > 0.75) {
            Constants.THREAT_VIRUS
        } else if (score > 150 && Math.random() > 0.6) {
            Constants.THREAT_CLOT
        } else {
            Constants.THREAT_DISRUPTION
        }
        enemies.add(SyncEnemy(id, sx, sy, type, angle))
    }

    private fun dealDamage(enemy: SyncEnemy) {
        val damage = when (enemy.type) {
            Constants.THREAT_CLOT -> 15
            Constants.THREAT_VIRUS -> 12
            else -> 10
        }
        heartHP = max(0, heartHP - damage)
        playSound(soundDamage)

        mpManager.broadcastMessage(GameMessage(
            type = Constants.MSG_HEART_DAMAGE,
            senderName = mpManager.localPlayerName,
            damage = damage
        ))
    }

    private fun renderOnlineCanvas() {
        val canvas = holder.lockCanvas() ?: return
        try {
            canvas.drawColor(Color.parseColor("#0a0505"))

            // Radar
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 2f
            paint.color = Color.argb(10, 255, 255, 255)
            canvas.drawCircle(centerX, centerY, min(centerX, centerY) * 0.7f, paint)

            paint.color = Color.argb(20, 239, 68, 68)
            canvas.drawCircle(centerX, centerY, 80f, paint)

            // Render synced enemies
            for (enemy in enemies) {
                paint.style = Paint.Style.FILL
                paint.color = when (enemy.type) {
                    Constants.THREAT_CLOT -> Color.parseColor("#f43f5e")
                    Constants.THREAT_VIRUS -> Color.parseColor("#fbbf24")
                    else -> Color.parseColor("#22d3ee")
                }
                canvas.drawCircle(enemy.x, enemy.y, enemy.radius, paint)
            }

            // Central beating heart
            paint.style = Paint.Style.FILL
            paint.color = if (heartHP < 30) Color.parseColor("#f43f5e") else Color.parseColor("#ef4444")
            drawVectorHeart(canvas, centerX, centerY, 45f * heartScale)

            // Dynamic co-op scores header line
            paint.color = Color.WHITE
            paint.textSize = 34f
            paint.textAlign = Paint.Align.LEFT
            canvas.drawText("${mpManager.localPlayerName}: $score", 30f, 60f, paint)
            
            paint.textAlign = Paint.Align.RIGHT
            canvas.drawText("مساعد: ${mpManager.opponentPlayerName}", width - 30f, 60f, paint)
            
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText("سلامة نبض القلب: $heartHP%", centerX, 110f, paint)

            if (heartHP <= 0) {
                paint.color = Color.RED
                paint.textSize = 50f
                canvas.drawText("توقف النبض - انتهت اللعبة", centerX, centerY, paint)
            }
        } finally {
            holder.unlockCanvasAndPost(canvas)
        }
    }

    private fun drawVectorHeart(canvas: Canvas, cx: Float, cy: Float, size: Float) {
        val path = Path()
        path.moveTo(cx, cy + size / 4)
        path.cubicTo(cx - size, cy - size, cx - size * 1.5f, cy + size * 0.4f, cx, cy + size * 1.5f)
        path.cubicTo(cx + size * 1.5f, cy + size * 0.4f, cx + size, cy - size, cx, cy + size / 4)
        canvas.drawPath(path, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            val tx = event.x
            val ty = event.y

            val iterator = enemies.iterator()
            while (iterator.hasNext()) {
                val enemy = iterator.next()
                if (sqrt((tx - enemy.x).pow(2) + (ty - enemy.y).pow(2)) < enemy.radius + 60f) {
                    
                    val beatElapsed = System.currentTimeMillis() - lastBeatTime
                    val isPerfect = beatElapsed < Constants.BEAT_PERFECT_WINDOW_MS
                    
                    enemy.hp -= 1
                    if (enemy.hp <= 0) {
                        iterator.remove()
                    }

                    // Tapped node: notify peer
                    mpManager.broadcastMessage(GameMessage(
                        type = Constants.MSG_PLAYER_TAP,
                        senderName = mpManager.localPlayerName,
                        score = if (isPerfect) 200 else 100,
                        threatId = enemy.id
                    ))

                    // Spark sound Locally
                    if (isPerfect) {
                        score += 200
                        playSound(soundPerfect)
                    } else {
                        score += 100
                        playSound(soundHit)
                    }
                    return true
                }
            }
        }
        return true
    }

    private fun playSound(id: Int) {
        soundPool?.play(id, 0.7f, 0.7f, 1, 0, 1.0f)
    }

    // --- Multiplayer Callback overrides ---
    override fun onConnectedToLobby() {}
    override fun onMatchStarted(isHost: Boolean) {
        this.isHost = isHost
    }

    override fun onMessageReceived(message: GameMessage) {
        when (message.type) {
            Constants.MSG_PLAYER_TAP -> {
                // Partner tapped an item successfully
                enemies.removeAll { it.id == message.threatId }
                score += message.score
                playSound(soundHit)
            }
            Constants.MSG_HEART_DAMAGE -> {
                heartHP = max(0, heartHP - message.damage)
                playSound(soundDamage)
            }
            Constants.MSG_BEAT_TRIGGER -> {
                lastBeatTime = System.currentTimeMillis()
                heartScale = 1.25f
                playSound(soundBeat)
            }
            Constants.MSG_SPAWN_THREAT -> {
                // Client spawns threat angle aligned with Host
                if (!isHost) {
                    spawnHostEnemy(message.threatId ?: "sys", message.angle)
                }
            }
        }
    }

    override fun onPlayerDisconnected(playerName: String) {
        heartHP = 0 // end game
    }

    override fun onConnectionFailed(error: String) {}

    inner class SyncEnemy(val id: String, var x: Float, var y: Float, val type: String, val startAngle: Float) {
        var radius = 25f
        var speed = 4f
        var hp = 1

        init {
            when (type) {
                Constants.THREAT_CLOT -> {
                    radius = 35f
                    speed = 2.5f
                    hp = 2
                }
                Constants.THREAT_VIRUS -> {
                    radius = 20f
                    speed = 6f
                }
            }
        }

        fun move(cx: Float, cy: Float) {
            val dx = cx - x
            val dy = cy - y
            val angle = atan2(dy, dx)
            
            if (type == Constants.THREAT_VIRUS) {
                val waveOffset = (sin(sqrt(dx.pow(2) + dy.pow(2)) * 0.05f) * 0.15f)
                x += speed * cos(angle + waveOffset).toFloat()
                y += speed * sin(angle + waveOffset).toFloat()
            } else {
                x += speed * cos(angle).toFloat()
                y += speed * sin(angle).toFloat()
            }
        }
    }
}
