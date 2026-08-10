package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncSerializerTest {
    private val timestamp = "2026-07-05T12:34:56.789Z"
    private val preciseTimestamp = "2026-07-05T12:34:56.007Z"
    private val device = SyncDeviceMetadata(
        deviceId = "device-abc",
        deviceName = "Android Phone",
    )
    private val folder = Folder(
        id = "projects",
        name = "Projects",
        colorClass = "bg-slate-400",
        createdAt = timestamp,
        updatedAt = timestamp,
    )
    private val tag = Tag(
        id = "work",
        name = "work",
        createdAt = timestamp,
        updatedAt = timestamp,
    )

    @Test
    fun parsesDesktopCompatibleManifest() {
        val json = JSONObject()
            .put("appName", "Lumo Notes")
            .put("manifestVersion", 1)
            .put("updatedAt", timestamp)
            .put(
                "changes",
                JSONArray().put(
                    manifestEntryJson(
                        changeId = "note-note-test-20260705123456789-device-desktop",
                        entityType = "note",
                        entityId = "note-test",
                    ),
                ),
            )

        val manifest = SyncSerializer.manifestFromJson(json)

        assertEquals("Lumo Notes", manifest.appName)
        assertEquals(1, manifest.manifestVersion)
        assertEquals(timestamp, manifest.updatedAt)
        assertEquals("note-note-test-20260705123456789-device-desktop", manifest.changes.single().changeId)
        assertEquals(SyncEntityType.Note, manifest.changes.single().entityType)
        assertEquals(SyncOperation.Upsert, manifest.changes.single().operation)
    }

    @Test
    fun serializesManifestMatchingDesktopShape() {
        val manifest = SyncManifest(
            updatedAt = timestamp,
            changes = listOf(
                SyncManifestEntry(
                    changeId = "folder-projects-123-device-abc",
                    createdAt = timestamp,
                    deviceId = device.deviceId,
                    deviceName = device.deviceName,
                    entityType = SyncEntityType.Folder,
                    entityId = "projects",
                    operation = SyncOperation.Upsert,
                    fileId = "drive-file-id",
                    fileName = "changes/lumo-sync-change-folder-projects-123-device-abc.json.enc",
                ),
            ),
        )

        val json = SyncSerializer.manifestToJson(manifest)
        val entry = json.getJSONArray("changes").getJSONObject(0)

        assertEquals("Lumo Notes", json.getString("appName"))
        assertEquals(1, json.getInt("manifestVersion"))
        assertEquals(timestamp, json.getString("updatedAt"))
        assertEquals("folder-projects-123-device-abc", entry.getString("changeId"))
        assertEquals("folder", entry.getString("entityType"))
        assertEquals("upsert", entry.getString("operation"))
        assertEquals("drive-file-id", entry.getString("fileId"))
    }

    @Test
    fun parsesDesktopCompatibleNoteChangeRecord() {
        val record = SyncSerializer.changeRecordFromJson(
            changeRecordJson(
                changeId = "note-note-test-20260705123456789-device-desktop",
                entityType = "note",
                entityId = "note-test",
                operation = "upsert",
                payload = backupJson(notes = listOf(note(tags = listOf("work"))), folders = listOf(folder), tags = listOf("work")),
            ),
        )

        val payload = record.payload as SyncPayload.Backup

        assertEquals(1, record.schemaVersion)
        assertEquals("device-desktop", record.deviceId)
        assertEquals(SyncEntityType.Note, record.entityType)
        assertEquals(SyncOperation.Upsert, record.operation)
        assertEquals("note-test", payload.backup.notes.single().id)
        assertEquals(listOf("work"), payload.backup.notes.single().tags)
        assertEquals(timestamp, record.createdAt)
    }

    @Test
    fun serializesNoteCreateUpdateDeleteAndRestoreRecords() {
        val active = note(tags = listOf("work"), updatedAt = preciseTimestamp)
        val deleted = active.copy(isDeleted = true, isPinned = false)
        val restored = active.copy(id = "note-restored", isDeleted = false, isPinned = true)

        val createJson = SyncSerializer.changeRecordToJson(
            SyncSerializer.noteChangeRecord(active, listOf(folder), listOf(tag), device),
        )
        val deleteJson = SyncSerializer.changeRecordToJson(
            SyncSerializer.noteChangeRecord(deleted, listOf(folder), listOf(tag), device),
        )
        val restoreJson = SyncSerializer.changeRecordToJson(
            SyncSerializer.noteChangeRecord(restored, listOf(folder), listOf(tag), device),
        )

        assertEquals("upsert", createJson.getString("operation"))
        assertEquals("delete", deleteJson.getString("operation"))
        assertEquals("upsert", restoreJson.getString("operation"))
        assertEquals(preciseTimestamp, createJson.getString("createdAt"))
        assertEquals(preciseTimestamp, createJson.getJSONObject("payload").getJSONObject("metadata").getString("exportedAt"))
        assertTrue(deleteJson.getJSONObject("payload").getJSONArray("notes").getJSONObject(0).getBoolean("isDeleted"))
        assertFalse(deleteJson.getJSONObject("payload").getJSONArray("notes").getJSONObject(0).getBoolean("isPinned"))
        assertFalse(restoreJson.getJSONObject("payload").getJSONArray("notes").getJSONObject(0).getBoolean("isDeleted"))
        assertEquals("note-note-test-20260705123456007-device-abc", createJson.getString("changeId"))
    }

    @Test
    fun serializesFolderAndTagUpsertRecords() {
        val folderJson = SyncSerializer.changeRecordToJson(
            SyncSerializer.folderChangeRecord(folder, device, createdAt = timestamp, stamp = "a1b2c3d4e5f6abcd"),
        )
        val tagJson = SyncSerializer.changeRecordToJson(
            SyncSerializer.tagChangeRecord(tag, device, createdAt = timestamp, stamp = "a1b2c3d4e5f6abcd"),
        )

        assertEquals("folder", folderJson.getString("entityType"))
        assertEquals("upsert", folderJson.getString("operation"))
        assertEquals("projects", folderJson.getJSONObject("payload").getJSONArray("folders").getJSONObject(0).getString("id"))
        assertEquals("folder-projects-123456-device-abc", folderJson.getString("changeId"))
        assertEquals("tag", tagJson.getString("entityType"))
        assertEquals("work", tagJson.getString("entityId"))
        assertEquals("work", tagJson.getJSONObject("payload").getJSONArray("tags").getString(0))
        assertEquals("tag-work-123456-device-abc", tagJson.getString("changeId"))
    }

    @Test
    fun preservesRawNoteTagRelationshipRecordsBecauseDesktopDoesNotEmitPayloadShape() {
        val relationshipPayload = JSONObject()
            .put("noteId", "note-test")
            .put("tag", "work")
        val record = SyncSerializer.changeRecordFromJson(
            changeRecordJson(
                changeId = "note_tag-note-test-work-20260705123456789-device-desktop",
                entityType = "note_tag",
                entityId = "note-test:work",
                operation = "upsert",
                payload = relationshipPayload,
            ),
        )
        val json = SyncSerializer.changeRecordToJson(record)

        val payload = record.payload as SyncPayload.RawJson

        assertEquals(SyncEntityType.NoteTag, record.entityType)
        assertEquals("work", payload.json.getString("tag"))
        assertEquals("work", json.getJSONObject("payload").getString("tag"))
    }

    @Test
    fun preservesChangeIdDeviceIdAndTimestampPrecision() {
        val record = SyncSerializer.changeRecordFromJson(
            changeRecordJson(
                changeId = "note-note-test-20260705123456007-device-desktop",
                createdAt = preciseTimestamp,
                entityType = "note",
                entityId = "note-test",
                operation = "upsert",
                payload = backupJson(notes = listOf(note(updatedAt = preciseTimestamp))),
            ),
        )

        val json = SyncSerializer.changeRecordToJson(record)

        assertEquals("note-note-test-20260705123456007-device-desktop", json.getString("changeId"))
        assertEquals("device-desktop", json.getString("deviceId"))
        assertEquals(preciseTimestamp, json.getString("createdAt"))
        assertEquals(preciseTimestamp, json.getJSONObject("payload").getJSONArray("notes").getJSONObject(0).getString("updatedAt"))
    }

    @Test
    fun parsesAndSerializesConflictResolutionPayload() {
        val finalBackup = backupJson(notes = listOf(note(id = "note-final")))
        val payload = JSONObject()
            .put("conflictId", "sync-conflict-123")
            .put("originalNoteId", "note-test")
            .put("sourceRemoteChangeId", "note-note-test-remote")
            .put("selectedResolution", "keep_remote")
            .put("resultingNoteId", JSONObject.NULL)
            .put("resolvingDeviceId", "device-desktop")
            .put("resolvedAt", timestamp)
            .put("finalNotePayload", finalBackup)

        val record = SyncSerializer.changeRecordFromJson(
            changeRecordJson(
                changeId = "conflict_resolution-sync-conflict-123-20260705123456789-device-desktop",
                entityType = "conflict_resolution",
                entityId = "sync-conflict-123",
                operation = "upsert",
                payload = payload,
            ),
        )
        val resolution = (record.payload as SyncPayload.ConflictResolution).resolution
        val json = SyncSerializer.changeRecordToJson(record)

        assertEquals("keep_remote", resolution.selectedResolution)
        assertEquals("note-final", resolution.finalNotePayload?.notes?.single()?.id)
        assertTrue(json.getJSONObject("payload").isNull("resultingNoteId"))
        assertEquals("note-final", json.getJSONObject("payload").getJSONObject("finalNotePayload").getJSONArray("notes").getJSONObject(0).getString("id"))
    }

    @Test
    fun preservesUnknownEntityAndOperationAsRawJson() {
        val record = SyncSerializer.changeRecordFromJson(
            changeRecordJson(
                changeId = "future-entity-1",
                entityType = "future_entity",
                entityId = "future-id",
                operation = "merge",
                payload = JSONObject().put("custom", true),
            ),
        )
        val json = SyncSerializer.changeRecordToJson(record)

        assertEquals("future_entity", record.entityType.value)
        assertEquals("merge", record.operation.value)
        assertTrue((record.payload as SyncPayload.RawJson).json.getBoolean("custom"))
        assertEquals("future_entity", json.getString("entityType"))
        assertEquals("merge", json.getString("operation"))
    }

    @Test
    fun serializesDesktopChangeFileName() {
        val fileName = SyncSerializer.changeFileName("note:note/test.1:2026 device")

        assertEquals("changes/lumo-sync-change-note-note-test-1-2026-device.json.enc", fileName)
    }

    private fun manifestEntryJson(
        changeId: String,
        entityType: String,
        entityId: String,
    ): JSONObject = JSONObject()
        .put("changeId", changeId)
        .put("createdAt", timestamp)
        .put("deviceId", "device-desktop")
        .put("deviceName", "Linux PC")
        .put("entityType", entityType)
        .put("entityId", entityId)
        .put("operation", "upsert")
        .put("fileId", "drive-file-id")
        .put("fileName", "changes/lumo-sync-change-$changeId.json.enc")

    private fun changeRecordJson(
        changeId: String,
        entityType: String,
        entityId: String,
        operation: String,
        payload: JSONObject,
        createdAt: String = timestamp,
    ): JSONObject = JSONObject()
        .put("schemaVersion", 1)
        .put("changeId", changeId)
        .put("deviceId", "device-desktop")
        .put("deviceName", "Linux PC")
        .put("createdAt", createdAt)
        .put("entityType", entityType)
        .put("entityId", entityId)
        .put("operation", operation)
        .put("payload", payload)

    private fun backupJson(
        notes: List<Note> = emptyList(),
        folders: List<Folder> = emptyList(),
        tags: List<String> = emptyList(),
    ): JSONObject = LumoBackupSerializer.toJson(
        LumoBackupPayload(
            exportedAt = timestamp,
            notes = notes,
            folders = folders,
            tags = tags,
            noteTags = notes.flatMap { note ->
                note.tags.map { tag -> LumoNoteTagPayload(noteId = note.id, tag = tag) }
            },
        ),
    )

    private fun note(
        id: String = "note-test",
        tags: List<String> = emptyList(),
        updatedAt: String = timestamp,
    ): Note = Note(
        id = id,
        title = "Title",
        content = "Body",
        preview = "Preview",
        folderId = "projects",
        folderName = "Projects",
        tags = tags,
        isPinned = false,
        isFavorite = false,
        isDeleted = false,
        isArchived = false,
        isLocked = false,
        encryptedContent = null,
        encryptedPreview = null,
        encryptionNonce = null,
        lockedAt = null,
        createdAt = timestamp,
        updatedAt = updatedAt,
    )
}
