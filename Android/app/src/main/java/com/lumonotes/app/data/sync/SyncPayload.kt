package com.lumonotes.app.data.sync

import org.json.JSONObject

data class SyncDeviceMetadata(
    val deviceId: String,
    val deviceName: String,
)

data class SyncEntityType(val value: String) {
    companion object {
        val Note = SyncEntityType("note")
        val Folder = SyncEntityType("folder")
        val Tag = SyncEntityType("tag")
        val NoteTag = SyncEntityType("note_tag")
        val Attachment = SyncEntityType("attachment")
        val ConflictResolution = SyncEntityType("conflict_resolution")

        val desktopValues = setOf(Note, Folder, Tag, NoteTag, Attachment, ConflictResolution)
    }
}

data class SyncOperation(val value: String) {
    companion object {
        val Upsert = SyncOperation("upsert")
        val Delete = SyncOperation("delete")

        val desktopValues = setOf(Upsert, Delete)
    }
}

data class SyncManifest(
    val appName: String = "Lumo Notes",
    val manifestVersion: Int = 1,
    val updatedAt: String,
    val changes: List<SyncManifestEntry>,
)

data class SyncManifestEntry(
    val changeId: String,
    val createdAt: String,
    val deviceId: String,
    val deviceName: String,
    val entityType: SyncEntityType,
    val entityId: String,
    val operation: SyncOperation,
    val fileId: String,
    val fileName: String,
)

data class SyncChangeRecord(
    val schemaVersion: Int = 1,
    val changeId: String,
    val deviceId: String,
    val deviceName: String,
    val createdAt: String,
    val entityType: SyncEntityType,
    val entityId: String,
    val operation: SyncOperation,
    val payload: SyncPayload,
)

sealed interface SyncPayload {
    data class Backup(val backup: LumoBackupPayload) : SyncPayload
    data class ConflictResolution(val resolution: SyncConflictResolutionPayload) : SyncPayload
    data class RawJson(val json: JSONObject) : SyncPayload
}

data class SyncConflictResolutionPayload(
    val conflictId: String,
    val originalNoteId: String,
    val sourceRemoteChangeId: String,
    val selectedResolution: String,
    val resultingNoteId: String?,
    val resolvingDeviceId: String,
    val resolvedAt: String,
    val finalNotePayload: LumoBackupPayload?,
)

object SyncContractConstants {
    const val manifestFileName = "lumo-sync-manifest.json"
    const val changeFilePrefix = "changes/lumo-sync-change-"
    const val changeFileSuffix = ".json.enc"
    const val lastSyncSettingKey = "sync.googleDriveLastSyncAt"
    const val seenChangeIdsSettingKey = "sync.googleDriveSeenChangeIds"
}
