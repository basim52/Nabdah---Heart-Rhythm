package com.example.nabdah

object Constants {
    const val DEFAULT_BPM = 72
    const val MAX_HEALTH = 100
    const val BEAT_PERFECT_WINDOW_MS = 150
    const val TARGET_FPS = 60
    const val MILLIS_PER_FRAME = 1000 / TARGET_FPS

    // Threat types
    const val THREAT_DISRUPTION = "DISRUPTION" // Cyan
    const val THREAT_CLOT = "CLOT"             // Dark Rose (double hit)
    const val THREAT_VIRUS = "VIRUS"           // Gold (sinuous path)

    // Game message types for multiplayer sync
    const val MSG_PLAYER_TAP = "PLAYER_TAP"
    const val MSG_HEART_DAMAGE = "HEART_DAMAGE"
    const val MSG_BEAT_TRIGGER = "BEAT_TRIGGER"
    const val MSG_SPAWN_THREAT = "SPAWN_THREAT"
    const val MSG_GAME_OVER = "GAME_OVER"
}
