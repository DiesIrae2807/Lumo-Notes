package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LumoBackupSerializerTest {
    private val timestamp = "2026-07-05T12:34:56.789Z"
    private val folder = Folder(
        id = "projects",
        name = "Projects",
        colorClass = "bg-slate-400",
        createdAt = timestamp,
        updatedAt = timestamp,
    )
    private val tags = listOf(
        Tag(id = "work", name = "work", createdAt = timestamp, updatedAt = timestamp),
        Tag(id = "mobile", name = "mobile", createdAt = timestamp, updatedAt = timestamp),
    )

    @Test
    fun serializesExactDesktopBackupShape() {
        val note = note(tags = listOf("work", "mobile"))
        val payload = LumoBackupSerializer.createPayload(
            notes = listOf(note),
            folders = listOf(folder),
            tags = tags,
            exportedAt = timestamp,
        )

        val json = LumoBackupSerializer.toJson(payload)

        val metadata = json.getJSONObject("metadata")
        assertEquals("Lumo Notes", metadata.getString("appName"))
        assertEquals(1, metadata.getInt("backupVersion"))
        assertEquals(timestamp, metadata.getString("exportedAt"))
        assertTrue(json.has("notes"))
        assertTrue(json.has("folders"))
        assertTrue(json.has("tags"))
        assertTrue(json.has("noteTags"))
        assertTrue(json.has("attachments"))
        assertTrue(json.isNull("lockMetadata"))

        val serializedNote = json.getJSONArray("notes").getJSONObject(0)
        assertEquals("note-test", serializedNote.getString("id"))
        assertEquals("Title", serializedNote.getString("title"))
        assertEquals("Body", serializedNote.getString("content"))
        assertEquals("Preview", serializedNote.getString("preview"))
        assertEquals("projects", serializedNote.getString("folderId"))
        assertEquals("Projects", serializedNote.getString("folderName"))
        assertEquals("work", serializedNote.getJSONArray("tags").getString(0))
        assertFalse(serializedNote.getBoolean("isDeleted"))
        assertFalse(serializedNote.getBoolean("isPinned"))
        assertTrue(serializedNote.isNull("encryptedContent"))
        assertEquals(timestamp, serializedNote.getString("createdAt"))
        assertEquals(timestamp, serializedNote.getString("updatedAt"))

        val serializedFolder = json.getJSONArray("folders").getJSONObject(0)
        assertEquals("projects", serializedFolder.getString("id"))
        assertEquals("Projects", serializedFolder.getString("name"))
        assertEquals("bg-slate-400", serializedFolder.getString("colorClass"))
        assertFalse(serializedFolder.has("createdAt"))

        val noteTags = json.getJSONArray("noteTags")
        assertEquals(2, noteTags.length())
        assertEquals("note-test", noteTags.getJSONObject(0).getString("noteId"))
        assertEquals("work", noteTags.getJSONObject(0).getString("tag"))
    }

    @Test
    fun roundTripsNotesFoldersTagsAndRelationships() {
        val original = note(tags = listOf("work", "mobile"))
        val json = LumoBackupSerializer.toJsonString(
            LumoBackupSerializer.createPayload(
                notes = listOf(original),
                folders = listOf(folder),
                tags = tags,
                exportedAt = timestamp,
            ),
        )

        val decoded = LumoBackupSerializer.fromJsonString(json)

        assertEquals(timestamp, decoded.payload.exportedAt)
        assertEquals(original, decoded.payload.notes.single())
        assertEquals(folder.id, decoded.payload.folders.single().id)
        assertEquals(folder.name, decoded.payload.folders.single().name)
        assertEquals(listOf("work", "mobile"), decoded.payload.tags)
        assertEquals(2, decoded.payload.noteTags.size)
        assertEquals(listOf("work", "mobile"), decoded.tagEntities.map { it.name })
    }

    @Test
    fun serializesDeletedAndRestoredStateExactlyAsNoteFields() {
        val deleted = note(isDeleted = true, isPinned = false)
        val restored = note(id = "note-restored", isDeleted = false, isPinned = true)
        val json = LumoBackupSerializer.toJson(
            LumoBackupSerializer.createPayload(
                notes = listOf(deleted, restored),
                folders = listOf(folder),
                tags = emptyList(),
                exportedAt = timestamp,
            ),
        )

        assertTrue(json.getJSONArray("notes").getJSONObject(0).getBoolean("isDeleted"))
        assertFalse(json.getJSONArray("notes").getJSONObject(0).getBoolean("isPinned"))
        assertFalse(json.getJSONArray("notes").getJSONObject(1).getBoolean("isDeleted"))
        assertTrue(json.getJSONArray("notes").getJSONObject(1).getBoolean("isPinned"))
    }

    @Test
    fun deserializesNoteWithoutFolderPayloadButPreservesFolderFields() {
        val json = JSONObject()
            .put("metadata", JSONObject().put("appName", "Lumo Notes").put("backupVersion", 1).put("exportedAt", timestamp))
            .put("notes", org.json.JSONArray().put(LumoBackupSerializer.toJson(
                LumoBackupSerializer.createPayload(listOf(note()), emptyList(), emptyList(), timestamp),
            ).getJSONArray("notes").getJSONObject(0)))
            .put("folders", org.json.JSONArray())
            .put("tags", org.json.JSONArray())
            .put("noteTags", org.json.JSONArray())
            .put("attachments", org.json.JSONArray())
            .put("lockMetadata", JSONObject.NULL)

        val decoded = LumoBackupSerializer.fromJson(json)

        assertTrue(decoded.payload.folders.isEmpty())
        assertEquals("projects", decoded.payload.notes.single().folderId)
        assertEquals("Projects", decoded.payload.notes.single().folderName)
    }

    @Test
    fun deserializesRelationshipTagsIntoNoteTags() {
        val base = LumoBackupSerializer.toJson(
            LumoBackupSerializer.createPayload(
                notes = listOf(note(tags = emptyList())),
                folders = listOf(folder),
                tags = listOf(tags[0]),
                exportedAt = timestamp,
            ),
        )
        base.put("noteTags", org.json.JSONArray().put(JSONObject().put("noteId", "note-test").put("tag", "work")))

        val decoded = LumoBackupSerializer.fromJson(base)

        assertEquals(listOf("work"), decoded.payload.notes.single().tags)
    }

    @Test
    fun preservesEmptyFieldsNullsAndTimestampPrecision() {
        val empty = note(
            title = "",
            content = "",
            preview = "",
            encryptedContent = null,
            updatedAt = "2026-07-05T12:34:56.007Z",
        )
        val json = LumoBackupSerializer.toJson(
            LumoBackupSerializer.createPayload(listOf(empty), listOf(folder), emptyList(), exportedAt = timestamp),
        )
        val serialized = json.getJSONArray("notes").getJSONObject(0)

        assertEquals("", serialized.getString("title"))
        assertEquals("", serialized.getString("content"))
        assertTrue(serialized.isNull("encryptedContent"))
        assertEquals("2026-07-05T12:34:56.007Z", serialized.getString("updatedAt"))

        val decoded = LumoBackupSerializer.fromJson(json).payload.notes.single()
        assertEquals("", decoded.title)
        assertNull(decoded.encryptedContent)
        assertEquals("2026-07-05T12:34:56.007Z", decoded.updatedAt)
    }

    @Test
    fun lockedNotesSerializeBlankContentAndKeepEncryptedMetadata() {
        val locked = note(
            content = "Secret",
            preview = "Secret",
            isLocked = true,
            encryptedContent = "cipher-content",
            encryptedPreview = "cipher-preview",
            encryptionNonce = "content-nonce:preview-nonce",
            lockedAt = timestamp,
        )

        val serialized = LumoBackupSerializer.toJson(
            LumoBackupSerializer.createPayload(listOf(locked), listOf(folder), emptyList(), timestamp),
        ).getJSONArray("notes").getJSONObject(0)

        assertEquals("", serialized.getString("content"))
        assertEquals("", serialized.getString("preview"))
        assertEquals("cipher-content", serialized.getString("encryptedContent"))
        assertEquals("content-nonce:preview-nonce", serialized.getString("encryptionNonce"))
    }

    private fun note(
        id: String = "note-test",
        title: String = "Title",
        content: String = "Body",
        preview: String = "Preview",
        tags: List<String> = emptyList(),
        isDeleted: Boolean = false,
        isPinned: Boolean = false,
        isLocked: Boolean = false,
        encryptedContent: String? = null,
        encryptedPreview: String? = null,
        encryptionNonce: String? = null,
        lockedAt: String? = null,
        updatedAt: String = timestamp,
    ): Note = Note(
        id = id,
        title = title,
        content = content,
        preview = preview,
        folderId = "projects",
        folderName = "Projects",
        tags = tags,
        isPinned = isPinned,
        isFavorite = false,
        isDeleted = isDeleted,
        isArchived = false,
        isLocked = isLocked,
        encryptedContent = encryptedContent,
        encryptedPreview = encryptedPreview,
        encryptionNonce = encryptionNonce,
        lockedAt = lockedAt,
        createdAt = timestamp,
        updatedAt = updatedAt,
    )
}
