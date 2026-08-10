package com.lumonotes.app.data.sync

import com.lumonotes.app.data.sync.local.SyncConflictDao
import com.lumonotes.app.data.sync.local.SyncConflictEntity
import kotlinx.coroutines.flow.Flow

enum class ConflictResolution(val value: String) {
    KeepLocal("keep_local"),
    KeepRemote("keep_remote"),
    KeepBoth("keep_both"),
}

class SyncConflictRepository(private val dao: SyncConflictDao) {
    fun observeUnresolved(): Flow<List<SyncConflictEntity>> = dao.observeUnresolved()

    suspend fun listUnresolved(): List<SyncConflictEntity> = dao.listUnresolved()

    suspend fun create(conflict: SyncConflictEntity): SyncConflictEntity {
        dao.insert(conflict)
        return dao.getByRemoteChangeId(conflict.remoteChangeId)
            ?: error("Sync conflict could not be stored.")
    }

    suspend fun markResolved(
        id: String,
        resolution: ConflictResolution,
        resolvedAt: String,
        resultEntityId: String? = null,
    ): Boolean = dao.markResolved(id, resolution.value, resolvedAt, resultEntityId) > 0
}
