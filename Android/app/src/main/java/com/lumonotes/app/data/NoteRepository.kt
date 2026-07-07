package com.lumonotes.app.data

import com.lumonotes.app.data.local.NoteDao
import com.lumonotes.app.data.local.FolderDao
import com.lumonotes.app.data.local.TagDao
import com.lumonotes.app.data.local.toDomain
import com.lumonotes.app.data.local.toEntity
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import com.lumonotes.app.domain.contractNow
import com.lumonotes.app.domain.createDefaultFolder
import com.lumonotes.app.domain.createDefaultNote
import com.lumonotes.app.domain.newFolderId
import com.lumonotes.app.domain.plainTextPreview
import com.lumonotes.app.domain.tagIdFor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class NoteRepository(
    private val noteDao: NoteDao,
    private val folderDao: FolderDao,
    private val tagDao: TagDao,
) {
    fun observeActiveNotes(): Flow<List<Note>> =
        noteDao.observeActiveNotes().map { notes -> notes.map { it.toDomain() } }

    fun observeDeletedNotes(): Flow<List<Note>> =
        noteDao.observeDeletedNotes().map { notes -> notes.map { it.toDomain() } }

    fun observeNote(id: String): Flow<Note?> =
        noteDao.observeNote(id).map { it?.toDomain() }

    fun searchActiveNotes(query: String): Flow<List<Note>> =
        noteDao.searchActiveNotes(query.trim()).map { notes -> notes.map { it.toDomain() } }

    fun observeNotesByFolder(folderId: String, query: String): Flow<List<Note>> =
        noteDao.observeNotesByFolder(folderId, query.trim()).map { notes -> notes.map { it.toDomain() } }

    fun observeNotesByTag(tag: String, query: String): Flow<List<Note>> =
        noteDao.observeNotesByTag(tagNeedle = tagNeedle(tag), query = query.trim()).map { notes -> notes.map { it.toDomain() } }

    fun observeFolders(): Flow<List<Folder>> =
        folderDao.observeFolders().map { folders -> folders.map { it.toDomain() } }

    fun observeTags(): Flow<List<Tag>> =
        tagDao.observeTags().map { tags -> tags.map { it.toDomain() } }

    suspend fun createNote(): Note {
        ensureDefaultFolder()
        val note = createDefaultNote()
        noteDao.upsert(note.toEntity())
        return note
    }

    suspend fun createFolder(name: String): Folder {
        val cleanName = name.trim().ifEmpty { "New Folder" }
        val now = contractNow()
        val folder = Folder(
            id = newFolderId(cleanName),
            name = cleanName,
            colorClass = "bg-slate-400",
            createdAt = now,
            updatedAt = now,
        )
        folderDao.upsert(folder.toEntity())
        return folder
    }

    suspend fun createTag(name: String): Tag {
        val cleanName = name.trim().ifEmpty { "tag" }
        val now = contractNow()
        val tag = Tag(id = tagIdFor(cleanName), name = cleanName, createdAt = now, updatedAt = now)
        tagDao.upsert(tag.toEntity())
        return tag
    }

    suspend fun saveText(note: Note, title: String, content: String) {
        val cleanTitle = title.trim().ifEmpty { "Untitled Note" }
        noteDao.updateText(
            id = note.id,
            title = cleanTitle,
            content = content,
            preview = plainTextPreview(content),
            updatedAt = contractNow(),
        )
    }

    suspend fun softDelete(id: String) {
        noteDao.softDelete(id = id, updatedAt = contractNow())
    }

    suspend fun restore(id: String) {
        noteDao.restore(id = id, updatedAt = contractNow())
    }

    suspend fun assignFolder(noteId: String, folderId: String) {
        val folder = folderDao.getFolder(folderId)?.toDomain() ?: createDefaultFolder()
        noteDao.updateFolder(
            id = noteId,
            folderId = folder.id,
            folderName = folder.name,
            updatedAt = contractNow(),
        )
    }

    suspend fun setTags(noteId: String, tags: List<String>) {
        val cleanTags = tags
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinctBy { it.lowercase() }
        val now = contractNow()
        cleanTags.forEach { tag ->
            tagDao.upsert(Tag(id = tagIdFor(tag), name = tag, createdAt = now, updatedAt = now).toEntity())
        }
        noteDao.updateTags(id = noteId, tags = cleanTags, updatedAt = now)
    }

    suspend fun addTag(note: Note, tag: String) {
        val cleanTag = tag.trim()
        if (cleanTag.isEmpty()) return
        setTags(note.id, note.tags + cleanTag)
    }

    suspend fun removeTag(note: Note, tag: String) {
        setTags(note.id, note.tags.filterNot { it.equals(tag, ignoreCase = true) })
    }

    private suspend fun ensureDefaultFolder() {
        if (folderDao.getFolder("uncategorized") == null) {
            folderDao.upsert(createDefaultFolder().toEntity())
        }
    }

    private fun tagNeedle(tag: String): String = "\"${tag.replace("\"", "\\\"")}\""
}
