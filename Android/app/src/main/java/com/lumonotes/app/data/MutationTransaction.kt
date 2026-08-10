package com.lumonotes.app.data

import androidx.room.RoomDatabase
import androidx.room.withTransaction

interface MutationTransaction {
    suspend fun <T> run(block: suspend () -> T): T
}

object ImmediateMutationTransaction : MutationTransaction {
    override suspend fun <T> run(block: suspend () -> T): T = block()
}

class RoomMutationTransaction(private val database: RoomDatabase) : MutationTransaction {
    override suspend fun <T> run(block: suspend () -> T): T = database.withTransaction { block() }
}
