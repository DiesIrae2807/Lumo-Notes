package com.lumonotes.app.data.sync

import com.lumonotes.app.data.sync.local.PendingChangeEntity
import com.lumonotes.app.data.sync.local.SyncStateDao
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

interface LocalChangeTracker {
    suspend fun trackNote(note: Note): Boolean
    suspend fun trackFolder(folder: Folder): Boolean
    suspend fun trackTag(tag: Tag): Boolean
}

object NoOpLocalChangeTracker : LocalChangeTracker {
    override suspend fun trackNote(note: Note) = false
    override suspend fun trackFolder(folder: Folder) = false
    override suspend fun trackTag(tag: Tag) = false
}

class RoomLocalChangeTracker(private val dao: SyncStateDao) : LocalChangeTracker {
    override suspend fun trackNote(note: Note): Boolean {
        val operation = if (note.isDeleted) SyncOperation.Delete else SyncOperation.Upsert
        val payload = LumoBackupSerializer.toJsonString(
            LumoBackupSerializer.createPayload(
                notes = listOf(note),
                folders = emptyList(),
                tags = emptyList(),
                exportedAt = note.updatedAt,
            ),
        )
        return record(SyncEntityType.Note, note.id, operation, note.updatedAt, payload)
    }

    override suspend fun trackFolder(folder: Folder): Boolean {
        val payload = LumoBackupSerializer.toJsonString(
            LumoBackupPayload(
                exportedAt = folder.updatedAt,
                notes = emptyList(),
                folders = listOf(folder),
                tags = emptyList(),
                noteTags = emptyList(),
            ),
        )
        return record(SyncEntityType.Folder, folder.id, SyncOperation.Upsert, folder.updatedAt, payload)
    }

    override suspend fun trackTag(tag: Tag): Boolean {
        val payload = LumoBackupSerializer.toJsonString(
            LumoBackupPayload(
                exportedAt = tag.updatedAt,
                notes = emptyList(),
                folders = emptyList(),
                tags = listOf(tag.name),
                noteTags = emptyList(),
            ),
        )
        return record(SyncEntityType.Tag, tag.name, SyncOperation.Upsert, tag.updatedAt, payload)
    }

    private suspend fun record(
        entityType: SyncEntityType,
        entityId: String,
        operation: SyncOperation,
        sourceUpdatedAt: String,
        canonicalState: String,
    ): Boolean {
        val key = "${entityType.value}:$entityId"
        val fingerprint = sha256("${operation.value}\n$canonicalState")
        return dao.recordPending(
            PendingChangeEntity(
                key = key,
                entityType = entityType.value,
                entityId = entityId,
                operation = operation.value,
                sourceUpdatedAt = sourceUpdatedAt,
                stateFingerprint = fingerprint,
                createdAt = sourceUpdatedAt,
                updatedAt = sourceUpdatedAt,
            ),
        )
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}
