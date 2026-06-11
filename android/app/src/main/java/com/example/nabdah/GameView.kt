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

class GameView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : SurfaceView(context, attrs, defStyleAttr), SurfaceHolder.Callback, Runnable {

    private var gameThread: Thread? = null
    private var isPlaying = false
    private val holder: SurfaceHolder = getHolder().apply { addCallback(this@GameView) }

    // Logic Specs
    private var score = 0
    private var combo = 0
    private var maxCombo = 0
    private var heartHP = 100
    private var currentBPM = Constants.DEFAULT_BPM
    private val enemies = ArrayList<AndroidEnemy>()
    
    // Rendering Graphics
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var centerX = 0f
    private var centerY = 0f
    private var heartScale = 1.0f
    private var lastBeatTime = System.currentTimeMillis()

    // Sound Engine
    private var soundPool: SoundPool? = null
    private var soundBeat = 0
    private var soundHit = 0
    private var soundPerfect = 0
    private var soundDamage = 0

    init {
        setupSounds()
    }

    private fun setupSounds() {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        soundPool = SoundPool.Builder().setMaxStreams(5).setAudioAttributes(attrs).build()
        
        // Setup sound file loaders (res/raw/...)
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

            updateState()
            renderCanvas()

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

    private fun updateState() {
        val now = System.currentTimeMillis()
        val msPerBeat = 60000 / currentBPM

        // Beat schedule (LUB-DUB Rhythm pulse)
        if (now - lastBeatTime > msPerBeat) {
            lastBeatTime = now
            heartScale = 1.25f // Pulse inflation effect
            playSound(soundBeat)
            
            // Auto healing decay or scaling
            currentBPM = min(144, 72 + (score / 300) * 4)
        } else {
            heartScale = max(1.0f, heartScale - 0.02f)
        }

        // Spawn random threat
        val spawnInterval = max(700L, 2200L - (score / 4))
        if (enemies.isEmpty() || (now % spawnInterval < Constants.MILLIS_PER_FRAME)) {
            spawnEnemy()
        }

        // Advance threat positions
        val iterator = enemies.iterator()
        while (iterator.hasNext()) {
            val enemy = iterator.next()
            enemy.move(centerX, centerY)

            // Heart hit boundary damage condition
            val dist = distance(enemy.x, enemy.y, centerX, centerY)
            if (dist < 60) {
                applyHeartDamage(enemy)
                iterator.remove()
            }
        }
    }

    private fun spawnEnemy() {
        val randomAngle = (Math.random() * PI * 2).toFloat()
        val startRadius = min(centerX, centerY) * 0.95f
        val sx = centerX + startRadius * cos(randomAngle)
        val sy = centerY + startRadius * sin(randomAngle)
        
        val type = if (score > 400 && Math.random() > 0.75) {
            Constants.THREAT_VIRUS
        } else if (score > 150 && Math.random() > 0.6) {
            Constants.THREAT_CLOT
        } else {
            Constants.THREAT_DISRUPTION
        }

        enemies.add(AndroidEnemy(sx, sy, type, randomAngle))
    }

    private fun applyHeartDamage(enemy: AndroidEnemy) {
        val damage = when (enemy.type) {
            Constants.THREAT_CLOT -> 15
            Constants.THREAT_VIRUS -> 12
            else -> 10
        }
        heartHP = max(0, heartHP - damage)
        combo = 0
        playSound(soundDamage)
    }

    private fun renderCanvas() {
        val canvas = holder.lockCanvas() ?: return
        try {
            // Dark Frost Background
            canvas.drawColor(Color.parseColor("#0a0505"))

            // Render Radar Ring guides
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.5f
            paint.color = Color.argb(12, 255, 255, 255)
            canvas.drawCircle(centerX, centerY, min(centerX, centerY) * 0.7f, paint)

            paint.color = Color.argb(20, 255, 26, 26)
            canvas.drawCircle(centerX, centerY, 80f, paint) // Target Beat line

            // Render threats
            for (enemy in enemies) {
                paint.style = Paint.Style.FILL
                paint.color = when (enemy.type) {
                    Constants.THREAT_CLOT -> Color.parseColor("#f43f5e") // Rose
                    Constants.THREAT_VIRUS -> Color.parseColor("#fbbf24") // Gold
                    else -> Color.parseColor("#22d3ee") // Cyan
                }
                canvas.drawCircle(enemy.x, enemy.y, enemy.radius, paint)
            }

            // Draw Central pulsing heart
            paint.style = Paint.Style.FILL
            paint.color = if (heartHP < 30) Color.parseColor("#f43f5e") else Color.parseColor("#ef4444")
            
            val heartSize = 40f * heartScale
            drawVectorHeart(canvas, centerX, centerY, heartSize)

            // Render Vitals Text & Score HUD
            paint.color = Color.WHITE
            paint.style = Paint.Style.FILL
            paint.textSize = 34f
            paint.textAlign = Paint.Align.RIGHT
            canvas.drawText("النقاط: $score", width - 30f, 60f, paint)
            canvas.drawText("سلامة القلب: $heartHP%", width - 30f, 110f, paint)
            
            if (combo > 1) {
                paint.color = Color.parseColor("#f43f5e")
                paint.textSize = 28f
                canvas.drawText("سلسلة متتالية: ${combo}x", width - 30f, 155f, paint)
            }

            if (heartHP <= 0) {
                paint.color = Color.RED
                paint.textSize = 55f
                paint.textAlign = Paint.Align.CENTER
                canvas.drawText("تم توقف النبض - GAME OVER", centerX, centerY, paint)
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
                if (distance(tx, ty, enemy.x, enemy.y) < enemy.radius + 50) {
                    // Tap Node Hit Success
                    val beatElapsed = System.currentTimeMillis() - lastBeatTime
                    val isPerfect = beatElapsed < Constants.BEAT_PERFECT_WINDOW_MS
                    
                    enemy.hp -= 1
                    if (enemy.hp <= 0) {
                        iterator.remove()
                    }

                    if (isPerfect) {
                        score += 200
                        combo += 1
                        if (combo > maxCombo) maxCombo = combo
                        playSound(soundPerfect)
                    } else {
                        score += 100
                        combo += 1
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

    private fun distance(x1: Float, y1: Float, x2: Float, y2: Float): Float {
        return sqrt((x2 - x1).pow(2) + (y2 - y1).pow(2))
    }

    inner class AndroidEnemy(var x: Float, var y: Float, val type: String, val startAngle: Float) {
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
            
            // Special serpentine sweep movement for Gold Viruses
            if (type == Constants.THREAT_VIRUS) {
                val waveOffset = (sin(distance(cx, cy, x, y) * 0.05f) * 0.15f)
                x += speed * cos(angle + waveOffset).toFloat()
                y += speed * sin(angle + waveOffset).toFloat()
            } else {
                x += speed * cos(angle).toFloat()
                y += speed * sin(angle).toFloat()
            }
        }
    }
}
