package com.lumonotes.app.data.sync.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncStateDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertSeen(change: SeenChangeEntity): Long

    @Query("SELECT EXISTS(SELECT 1 FROM sync_seen_changes WHERE change_id = :changeId)")
    suspend fun hasSeen(changeId: String): Boolean

    @Query(
        """
        DELETE FROM sync_seen_changes
        WHERE change_id NOT IN (
            SELECT change_id FROM sync_seen_changes
            ORDER BY applied_at DESC, change_id DESC
            LIMIT :keep
        )
        """,
    )
    suspend fun pruneSeen(keep: Int)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertUploaded(change: UploadedChangeEntity): Long

    @Query("SELECT EXISTS(SELECT 1 FROM sync_uploaded_changes WHERE change_id = :changeId)")
    suspend fun hasUploaded(changeId: String): Boolean

    @Query("SELECT * FROM sync_pending_changes WHERE key = :key LIMIT 1")
    suspend fun getPending(key: String): PendingChangeEntity?

    @Query("SELECT * FROM sync_pending_changes ORDER BY updated_at ASC")
    fun observePending(): Flow<List<PendingChangeEntity>>

    @Query("SELECT * FROM sync_pending_changes ORDER BY updated_at ASC")
    suspend fun listPending(): List<PendingChangeEntity>

    @Upsert
    suspend fun upsertPending(change: PendingChangeEntity)

    @Query("DELETE FROM sync_pending_changes WHERE key = :key AND state_fingerprint = :stateFingerprint")
    suspend fun deletePendingIfCurrent(key: String, stateFingerprint: String): Int

    @Transaction
    suspend fun recordSeen(change: SeenChangeEntity, keep: Int = 2_000): Boolean {
        val inserted = insertSeen(change) != -1L
        if (inserted) pruneSeen(keep)
        return inserted
    }

    @Transaction
    suspend fun markUploaded(
        change: UploadedChangeEntity,
        pendingKey: String,
        stateFingerprint: String,
    ): Boolean {
        val inserted = insertUploaded(change) != -1L
        deletePendingIfCurrent(pendingKey, stateFingerprint)
        return inserted
    }

    @Transaction
    suspend fun recordPending(change: PendingChangeEntity): Boolean {
        val existing = getPending(change.key)
        if (existing?.stateFingerprint == change.stateFingerprint && existing.operation == change.operation) return false
        upsertPending(change.copy(createdAt = existing?.createdAt ?: change.createdAt))
        return true
    }
}

@Dao
interface SyncConflictDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(conflict: SyncConflictEntity): Long

    @Query("SELECT * FROM sync_conflicts WHERE remote_change_id = :remoteChangeId LIMIT 1")
    suspend fun getByRemoteChangeId(remoteChangeId: String): SyncConflictEntity?

    @Query("SELECT * FROM sync_conflicts WHERE status = 'unresolved' ORDER BY detected_at DESC")
    fun observeUnresolved(): Flow<List<SyncConflictEntity>>

    @Query("SELECT * FROM sync_conflicts WHERE status = 'unresolved' ORDER BY detected_at DESC")
    suspend fun listUnresolved(): List<SyncConflictEntity>

    @Query(
        """
        UPDATE sync_conflicts
        SET status = 'resolved', resolution = :resolution, resolved_at = :resolvedAt,
            result_entity_id = :resultEntityId, resolution_synced_at = NULL
        WHERE id = :id AND status = 'unresolved'
        """,
    )
    suspend fun markResolved(id: String, resolution: String, resolvedAt: String, resultEntityId: String?): Int
}
