package com.example.nabdah

import android.content.Context
import android.util.Log
import java.io.PrintWriter
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Handles communication for multiplayer game sessions in Nabdah.
 * Integrates with Google Play Games Services (GPGS) state or direct WebSockets/Sockets
 * to manage real-time rooms, packet serialization, and online match states.
 */
class MultiplayerManager private constructor(context: Context) {
    
    interface MultiplayerCallback {
        fun onConnectedToLobby()
        fun onMatchStarted(isHost: Boolean)
        fun onMessageReceived(message: GameMessage)
        fun onPlayerDisconnected(playerName: String)
        fun onConnectionFailed(error: String)
    }

    private var callback: MultiplayerCallback? = null
    private var socket: Socket? = null
    private var writer: PrintWriter? = null
    private var isRunning = false
    
    var isHost: Boolean = false
        private set
    
    var localPlayerName: String = "نبّاض"
    var opponentPlayerName: String = "طبيب مساعد"

    fun setListener(listener: MultiplayerCallback) {
        this.callback = listener
    }

    fun removeListener() {
        this.callback = null
    }

    /**
     * Join an online real-time matchmaking room or lobby using a direct server socket node.
     */
    fun connectToLobby(serverIp: String, port: Int, playerName: String) {
        this.localPlayerName = playerName
        thread {
            try {
                Log.d(TAG, "Connecting to Nabdah host server: $serverIp:$port")
                socket = Socket(serverIp, port)
                writer = PrintWriter(socket!!.getOutputStream(), true)
                isRunning = true
                
                // Read listener thread
                thread {
                    listenForIncomingPackets()
                }

                // Register with server
                sendSystemMessage("REGISTER", playerName)
                callback?.onConnectedToLobby()

                Log.d(TAG, "Matchmaking Connected!")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect to matchmaking server", e)
                callback?.onConnectionFailed(e.localizedMessage ?: "Connection Refused")
            }
        }
    }

    private fun listenForIncomingPackets() {
        val reader = socket?.getInputStream()?.bufferedReader() ?: return
        try {
            while (isRunning && socket?.isConnected == true) {
                val data = reader.readLine() ?: break
                Log.d(TAG, "Received packet: $data")
                
                try {
                    val msg = GameMessage.fromSerializedString(data)
                    
                    // Route system packets internal to matchmaking
                    if (msg.type == "MATCH_INIT") {
                        this.isHost = msg.extraData == "HOST"
                        callback?.onMatchStarted(isHost)
                    } else if (msg.type == "PLAYER_JOIN") {
                        this.opponentPlayerName = msg.senderName
                    } else {
                        callback?.onMessageReceived(msg)
                    }
                } catch (jsonEx: Exception) {
                    Log.e(TAG, "Error deserializing packet", jsonEx)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Socket read error, closing", e)
        } finally {
            disconnect()
        }
    }

    /**
     * Send game action updates to partner in real-time
     */
    fun broadcastMessage(message: GameMessage) {
        thread {
            try {
                val rawData = message.toSerializedString()
                writer?.println(rawData)
                Log.d(TAG, "Sent packet: $rawData")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send packet", e)
            }
        }
    }

    private fun sendSystemMessage(type: String, data: String) {
        val sysMsg = GameMessage(
            type = type,
            senderName = localPlayerName,
            extraData = data
        )
        broadcastMessage(sysMsg)
    }

    fun disconnect() {
        isRunning = false
        try {
            socket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing connection", e)
        }
        socket = null
        writer = null
        callback?.onPlayerDisconnected(opponentPlayerName)
    }

    companion object {
        private const val TAG = "MultiplayerManager"
        
        @Volatile
        private var instance: MultiplayerManager? = null

        fun getInstance(context: Context): MultiplayerManager {
            return instance ?: synchronized(this) {
                instance ?: MultiplayerManager(context.applicationContext).also { instance = it }
            }
        }
    }
}
