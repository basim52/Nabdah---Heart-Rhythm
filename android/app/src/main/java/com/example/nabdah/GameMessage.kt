package com.example.nabdah

import org.json.JSONObject

data class GameMessage(
    val type: String,
    val senderName: String,
    val score: Int = 0,
    val damage: Int = 0,
    val timestamp: Long = System.currentTimeMillis(),
    val threatId: String? = null,
    val angle: Float = 0f,
    val extraData: String? = null
) {
    fun toSerializedString(): String {
        val json = JSONObject()
        json.put("type", type)
        json.put("senderName", senderName)
        json.put("score", score)
        json.put("damage", damage)
        json.put("timestamp", timestamp)
        threatId?.let { json.put("threatId", it) }
        json.put("angle", angle.toDouble())
        extraData?.let { json.put("extraData", it) }
        return json.toString()
    }

    companion object {
        fun fromSerializedString(data: String): GameMessage {
            val json = JSONObject(data)
            return GameMessage(
                type = json.getString("type"),
                senderName = json.getString("senderName"),
                score = json.optInt("score", 0),
                damage = json.optInt("damage", 0),
                timestamp = json.optLong("timestamp", System.currentTimeMillis()),
                threatId = json.optString("threatId", null),
                angle = json.optDouble("angle", 0.0).toFloat(),
                extraData = json.optString("extraData", null)
            )
        }
    }
}
