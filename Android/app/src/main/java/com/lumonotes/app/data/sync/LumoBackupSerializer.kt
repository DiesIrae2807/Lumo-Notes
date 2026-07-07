package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import com.lumonotes.app.domain.contractNow
import com.lumonotes.app.domain.tagIdFor
import org.json.JSONArray
import org.json.JSONObject

object LumoBackupSerializer {
    fun createPayload(
        notes: List<Note>,
        folders: List<Folder>,
        tags: List<Tag>,
        exportedAt: String = contractNow(),
        includeTrash: Boolean = true,
    ): LumoBackupPayload {
        val backupNotes = notes.filter { includeTrash || !it.isDeleted }
        val backupNoteIds = backupNotes.mapTo(mutableSetOf()) { it.id }
        val tagNames = tags.map { it.name }
        val relationshipTags = backupNotes.flatMap { note -> note.tags }
        return LumoBackupPayload(
            exportedAt = exportedAt,
            notes = backupNotes,
            folders = folders,
            tags = uniqueByLower(tagNames + relationshipTags),
            noteTags = backupNotes.flatMap { note ->
                note.tags.map { tag -> LumoNoteTagPayload(noteId = note.id, tag = tag) }
            }.filter { it.noteId in backupNoteIds },
        )
    }

    fun toJsonString(payload: LumoBackupPayload): String = toJson(payload).toString()

    fun toJson(payload: LumoBackupPayload): JSONObject = JSONObject()
        .put(
            "metadata",
            JSONObject()
                .put("appName", "Lumo Notes")
                .put("backupVersion", 1)
                .put("exportedAt", payload.exportedAt),
        )
        .put("notes", JSONArray(payload.notes.map(::noteToJson)))
        .put("folders", JSONArray(payload.folders.map(::folderToJson)))
        .put("tags", JSONArray(payload.tags))
        .put("noteTags", JSONArray(payload.noteTags.map(::noteTagToJson)))
        .put("attachments", JSONArray())
        .put("lockMetadata", JSONObject.NULL)

    fun fromJsonString(value: String): LumoBackupDecoded = fromJson(JSONObject(value))

    fun fromJson(json: JSONObject): LumoBackupDecoded {
        val metadata = json.getJSONObject("metadata")
        require(metadata.getString("appName") == "Lumo Notes") { "Unsupported backup app." }
        require(metadata.getInt("backupVersion") == 1) { "Unsupported backup version." }

        val exportedAt = metadata.getString("exportedAt")
        val notes = json.getJSONArray("notes").mapObjects(::noteFromJson)
        val folders = json.getJSONArray("folders").mapObjects(::folderFromJson)
        val tagNames = json.getJSONArray("tags").mapStrings()
        val noteTags = json.getJSONArray("noteTags").mapObjects(::noteTagFromJson)
        val mergedNotes = mergeRelationshipTags(notes, noteTags)
        val tagEntities = uniqueByLower(tagNames + noteTags.map { it.tag } + mergedNotes.flatMap { it.tags })
            .map { tag -> Tag(id = tagIdFor(tag), name = tag, createdAt = exportedAt, updatedAt = exportedAt) }

        return LumoBackupDecoded(
            payload = LumoBackupPayload(
                exportedAt = exportedAt,
                notes = mergedNotes,
                folders = folders,
                tags = tagEntities.map { it.name },
                noteTags = noteTags,
            ),
            tagEntities = tagEntities,
        )
    }

    private fun noteToJson(note: Note): JSONObject = JSONObject()
        .put("id", note.id)
        .put("title", note.title)
        .put("content", if (note.isLocked) "" else note.content)
        .put("preview", if (note.isLocked) "" else note.preview)
        .put("folderId", note.folderId)
        .put("folderName", note.folderName)
        .put("tags", JSONArray(note.tags))
        .put("isPinned", note.isPinned)
        .put("isFavorite", note.isFavorite)
        .put("isDeleted", note.isDeleted)
        .put("isArchived", note.isArchived)
        .put("isLocked", note.isLocked)
        .put("encryptedContent", note.encryptedContent ?: JSONObject.NULL)
        .put("encryptedPreview", note.encryptedPreview ?: JSONObject.NULL)
        .put("encryptionNonce", note.encryptionNonce ?: JSONObject.NULL)
        .put("lockedAt", note.lockedAt ?: JSONObject.NULL)
        .put("createdAt", note.createdAt)
        .put("updatedAt", note.updatedAt)

    private fun noteFromJson(json: JSONObject): Note = Note(
        id = json.getString("id"),
        title = json.getString("title"),
        content = json.getString("content"),
        preview = json.getString("preview"),
        folderId = json.getString("folderId"),
        folderName = json.getString("folderName"),
        tags = json.getJSONArray("tags").mapStrings(),
        isPinned = json.getBoolean("isPinned"),
        isFavorite = json.getBoolean("isFavorite"),
        isDeleted = json.getBoolean("isDeleted"),
        isArchived = json.getBoolean("isArchived"),
        isLocked = json.getBoolean("isLocked"),
        encryptedContent = json.nullableString("encryptedContent"),
        encryptedPreview = json.nullableString("encryptedPreview"),
        encryptionNonce = json.nullableString("encryptionNonce"),
        lockedAt = json.nullableString("lockedAt"),
        createdAt = json.getString("createdAt"),
        updatedAt = json.getString("updatedAt"),
    )

    private fun folderToJson(folder: Folder): JSONObject = JSONObject()
        .put("id", folder.id)
        .put("name", folder.name)
        .put("colorClass", folder.colorClass)

    private fun folderFromJson(json: JSONObject): Folder {
        val fallbackTime = "1970-01-01T00:00:00.000Z"
        return Folder(
            id = json.getString("id"),
            name = json.getString("name"),
            colorClass = json.getString("colorClass"),
            createdAt = fallbackTime,
            updatedAt = fallbackTime,
        )
    }

    private fun noteTagToJson(noteTag: LumoNoteTagPayload): JSONObject = JSONObject()
        .put("noteId", noteTag.noteId)
        .put("tag", noteTag.tag)

    private fun noteTagFromJson(json: JSONObject): LumoNoteTagPayload = LumoNoteTagPayload(
        noteId = json.getString("noteId"),
        tag = json.getString("tag"),
    )

    private fun mergeRelationshipTags(notes: List<Note>, noteTags: List<LumoNoteTagPayload>): List<Note> =
        notes.map { note ->
            val relationships = noteTags.filter { it.noteId == note.id }.map { it.tag }
            note.copy(tags = uniqueByLower(note.tags + relationships))
        }

    private fun uniqueByLower(values: List<String>): List<String> =
        values.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }

    private fun JSONObject.nullableString(name: String): String? =
        if (isNull(name)) null else getString(name)

    private fun JSONArray.mapStrings(): List<String> = buildList {
        for (index in 0 until length()) add(getString(index))
    }

    private fun <T> JSONArray.mapObjects(mapper: (JSONObject) -> T): List<T> = buildList {
        for (index in 0 until length()) add(mapper(getJSONObject(index)))
    }
}
