package com.lumonotes.app.data.sync.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "sync_seen_changes")
data class SeenChangeEntity(
    @PrimaryKey @ColumnInfo(name = "change_id") val changeId: String,
    @ColumnInfo(name = "applied_at") val appliedAt: String,
    @ColumnInfo(name = "remote_device_id") val remoteDeviceId: String?,
)

@Entity(tableName = "sync_uploaded_changes")
data class UploadedChangeEntity(
    @PrimaryKey @ColumnInfo(name = "change_id") val changeId: String,
    @ColumnInfo(name = "uploaded_at") val uploadedAt: String,
)

@Entity(
    tableName = "sync_pending_changes",
    indices = [Index(value = ["entity_type", "entity_id"], unique = true)],
)
data class PendingChangeEntity(
    @PrimaryKey val key: String,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    val operation: String,
    @ColumnInfo(name = "source_updated_at") val sourceUpdatedAt: String,
    @ColumnInfo(name = "state_fingerprint") val stateFingerprint: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

@Entity(
    tableName = "sync_conflicts",
    indices = [Index(value = ["remote_change_id"], unique = true), Index(value = ["status"])],
)
data class SyncConflictEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    @ColumnInfo(name = "local_payload") val localPayload: String,
    @ColumnInfo(name = "remote_payload") val remotePayload: String,
    @ColumnInfo(name = "local_updated_at") val localUpdatedAt: String?,
    @ColumnInfo(name = "remote_created_at") val remoteCreatedAt: String?,
    @ColumnInfo(name = "local_device_id") val localDeviceId: String?,
    @ColumnInfo(name = "remote_device_id") val remoteDeviceId: String?,
    @ColumnInfo(name = "remote_change_id") val remoteChangeId: String,
    @ColumnInfo(name = "detected_at") val detectedAt: String,
    val status: String,
    val resolution: String?,
    @ColumnInfo(name = "resolved_at") val resolvedAt: String?,
    @ColumnInfo(name = "result_entity_id") val resultEntityId: String?,
    @ColumnInfo(name = "resolution_synced_at") val resolutionSyncedAt: String?,
)
