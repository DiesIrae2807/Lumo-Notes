package com.lumonotes.app.data.sync

import com.lumonotes.app.data.sync.local.PendingChangeEntity
import com.lumonotes.app.data.sync.local.SeenChangeEntity
import com.lumonotes.app.data.sync.local.SyncStateDao
import com.lumonotes.app.data.sync.local.UploadedChangeEntity
import kotlinx.coroutines.flow.Flow

class SyncStateRepository(
    private val preferences: SyncPreferencesStore,
    private val dao: SyncStateDao,
) {
    suspend fun deviceIdentity(): DeviceIdentity = preferences.getOrCreateDeviceIdentity()

    suspend fun updateDeviceName(name: String): DeviceIdentity = preferences.updateDeviceName(name)

    suspend fun state(): PersistentSyncState = preferences.readSyncState()

    suspend fun recordAttempt(timestamp: String) = preferences.recordAttempt(timestamp)

    suspend fun recordSuccess(timestamp: String) = preferences.recordSuccess(timestamp)

    suspend fun recordError(status: SyncStatus, category: SyncErrorCategory, message: String) =
        preferences.recordError(status, category, message)

    suspend fun recordSeen(changeId: String, appliedAt: String, remoteDeviceId: String?): Boolean =
        dao.recordSeen(SeenChangeEntity(changeId, appliedAt, remoteDeviceId))

    suspend fun hasSeen(changeId: String): Boolean = dao.hasSeen(changeId)

    suspend fun recordUploaded(changeId: String, uploadedAt: String): Boolean =
        dao.insertUploaded(UploadedChangeEntity(changeId, uploadedAt)) != -1L

    suspend fun hasUploaded(changeId: String): Boolean = dao.hasUploaded(changeId)

    fun observePending(): Flow<List<PendingChangeEntity>> = dao.observePending()

    suspend fun listPending(): List<PendingChangeEntity> = dao.listPending()

    suspend fun completePending(change: PendingChangeEntity): Boolean =
        dao.deletePendingIfCurrent(change.key, change.stateFingerprint) > 0

    suspend fun markPendingUploaded(change: PendingChangeEntity, changeId: String, uploadedAt: String): Boolean =
        dao.markUploaded(UploadedChangeEntity(changeId, uploadedAt), change.key, change.stateFingerprint)
}
