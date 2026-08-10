package com.lumonotes.app.data

import com.lumonotes.app.data.local.NoteDao
import com.lumonotes.app.data.local.FolderDao
import com.lumonotes.app.data.local.TagDao
import com.lumonotes.app.data.local.toDomain
import com.lumonotes.app.data.local.toEntity
import com.lumonotes.app.data.sync.LocalChangeTracker
import com.lumonotes.app.data.sync.NoOpLocalChangeTracker
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
    private val changeTracker: LocalChangeTracker = NoOpLocalChangeTracker,
    private val transaction: MutationTransaction = ImmediateMutationTransaction,
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
        return transaction.run {
            ensureDefaultFolder()
            val note = createDefaultNote()
            noteDao.upsert(note.toEntity())
            changeTracker.trackNote(note)
            note
        }
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
        transaction.run {
            folderDao.upsert(folder.toEntity())
            changeTracker.trackFolder(folder)
        }
        return folder
    }

    suspend fun createTag(name: String): Tag {
        val cleanName = name.trim().ifEmpty { "tag" }
        val now = contractNow()
        val tag = Tag(id = tagIdFor(cleanName), name = cleanName, createdAt = now, updatedAt = now)
        transaction.run {
            tagDao.upsert(tag.toEntity())
            changeTracker.trackTag(tag)
        }
        return tag
    }

    suspend fun saveText(note: Note, title: String, content: String) {
        val cleanTitle = title.trim().ifEmpty { "Untitled Note" }
        transaction.run {
            val changed = noteDao.updateText(
                id = note.id,
                title = cleanTitle,
                content = content,
                preview = plainTextPreview(content),
                updatedAt = contractNow(),
            )
            if (changed > 0) trackCurrentNote(note.id)
        }
    }

    suspend fun softDelete(id: String) {
        transaction.run {
            if (noteDao.softDelete(id = id, updatedAt = contractNow()) > 0) trackCurrentNote(id)
        }
    }

    suspend fun restore(id: String) {
        transaction.run {
            if (noteDao.restore(id = id, updatedAt = contractNow()) > 0) trackCurrentNote(id)
        }
    }

    suspend fun assignFolder(noteId: String, folderId: String) {
        val folder = folderDao.getFolder(folderId)?.toDomain() ?: createDefaultFolder()
        transaction.run {
            if (noteDao.updateFolder(
                    id = noteId,
                    folderId = folder.id,
                    folderName = folder.name,
                    updatedAt = contractNow(),
                ) > 0
            ) {
                trackCurrentNote(noteId)
            }
        }
    }

    suspend fun setTags(noteId: String, tags: List<String>) {
        val cleanTags = tags
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinctBy { it.lowercase() }
        val now = contractNow()
        transaction.run {
            cleanTags.forEach { tagName ->
                val tagId = tagIdFor(tagName)
                if (tagDao.getTag(tagId) == null) {
                    val tag = Tag(id = tagId, name = tagName, createdAt = now, updatedAt = now)
                    tagDao.upsert(tag.toEntity())
                    changeTracker.trackTag(tag)
                }
            }
            if (noteDao.updateTags(id = noteId, tags = cleanTags, updatedAt = now) > 0) trackCurrentNote(noteId)
        }
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

    private suspend fun trackCurrentNote(id: String) {
        noteDao.getNote(id)?.toDomain()?.let { changeTracker.trackNote(it) }
    }

    private fun tagNeedle(tag: String): String = "\"${tag.replace("\"", "\\\"")}\""
}
