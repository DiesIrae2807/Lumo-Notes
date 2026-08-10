package com.lumonotes.app.data

import com.lumonotes.app.data.local.FolderDao
import com.lumonotes.app.data.local.FolderEntity
import com.lumonotes.app.data.local.NoteDao
import com.lumonotes.app.data.local.NoteEntity
import com.lumonotes.app.data.local.TagDao
import com.lumonotes.app.data.local.TagEntity
import com.lumonotes.app.domain.createDefaultNote
import com.lumonotes.app.data.sync.LocalChangeTracker
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteRepositoryTest {
    private val noteDao = FakeNoteDao()
    private val folderDao = FakeFolderDao()
    private val tagDao = FakeTagDao()
    private val repository = NoteRepository(noteDao, folderDao, tagDao)

    @Test
    fun createsFoldersAndAssignsFolderToNote() = runTest {
        val note = repository.createNote()
        val folder = repository.createFolder("Projects")

        repository.assignFolder(note.id, folder.id)

        val updated = repository.observeNote(note.id).first()!!
        assertEquals(folder.id, updated.folderId)
        assertEquals("Projects", updated.folderName)
        assertTrue(repository.observeNotesByFolder(folder.id, "").first().any { it.id == note.id })
    }

    @Test
    fun createsTagsAssignsAndRemovesTags() = runTest {
        val note = repository.createNote()

        repository.createTag("work")
        repository.addTag(note, "work")

        val tagged = repository.observeNote(note.id).first()!!
        assertEquals(listOf("work"), tagged.tags)
        assertTrue(repository.observeNotesByTag("work", "").first().any { it.id == note.id })

        repository.removeTag(tagged, "work")

        assertTrue(repository.observeNote(note.id).first()!!.tags.isEmpty())
        assertTrue(repository.observeNotesByTag("work", "").first().isEmpty())
    }

    @Test
    fun deletedNotesAreOnlyVisibleInTrash() = runTest {
        val note = repository.createNote()
        repository.createTag("archive")
        repository.addTag(note, "archive")
        val tagged = repository.observeNote(note.id).first()!!

        repository.softDelete(note.id)

        assertFalse(repository.searchActiveNotes("").first().any { it.id == note.id })
        assertFalse(repository.observeNotesByFolder(tagged.folderId, "").first().any { it.id == note.id })
        assertFalse(repository.observeNotesByTag("archive", "").first().any { it.id == note.id })
        assertTrue(repository.observeDeletedNotes().first().any { it.id == note.id })
    }

    @Test
    fun restoreReturnsNoteToNormalQueries() = runTest {
        val note = repository.createNote()
        repository.softDelete(note.id)
        repository.restore(note.id)

        assertTrue(repository.searchActiveNotes("").first().any { it.id == note.id })
        assertFalse(repository.observeDeletedNotes().first().any { it.id == note.id })
    }

    @Test
    fun autosaveDoesNotOverwriteDeletionFields() = runTest {
        val note = repository.createNote()
        repository.softDelete(note.id)

        repository.saveText(note, "Changed", "Body")

        val saved = repository.observeNote(note.id).first()!!
        assertTrue(saved.isDeleted)
        assertFalse(saved.isPinned)
        assertEquals("Changed", saved.title)
        assertEquals("Body", saved.content)
    }

    @Test
    fun unchangedAutosaveDoesNotAdvanceTimestampOrTrackAnotherChange() = runTest {
        val tracker = CountingChangeTracker()
        val trackedRepository = NoteRepository(noteDao, folderDao, tagDao, changeTracker = tracker)
        val note = trackedRepository.createNote()
        val callsAfterCreate = tracker.notes.size

        trackedRepository.saveText(note, note.title, note.content)

        val unchanged = trackedRepository.observeNote(note.id).first()!!
        assertEquals(note.updatedAt, unchanged.updatedAt)
        assertEquals(callsAfterCreate, tracker.notes.size)
    }
}

private class CountingChangeTracker : LocalChangeTracker {
    val notes = mutableListOf<Note>()
    override suspend fun trackNote(note: Note): Boolean = notes.add(note)
    override suspend fun trackFolder(folder: Folder) = true
    override suspend fun trackTag(tag: Tag) = true
}

private class FakeNoteDao : NoteDao {
    private val notes = MutableStateFlow<List<NoteEntity>>(emptyList())

    override fun observeActiveNotes(): Flow<List<NoteEntity>> =
        notes.map { list -> list.filterNot { it.isDeleted }.sortedByDescending { it.updatedAt } }

    override fun observeDeletedNotes(): Flow<List<NoteEntity>> =
        notes.map { list -> list.filter { it.isDeleted }.sortedByDescending { it.updatedAt } }

    override fun observeNote(id: String): Flow<NoteEntity?> =
        notes.map { list -> list.firstOrNull { it.id == id } }

    override suspend fun getNote(id: String): NoteEntity? = notes.value.firstOrNull { it.id == id }

    override fun searchActiveNotes(query: String): Flow<List<NoteEntity>> =
        notes.map { list ->
            list.filter {
                !it.isDeleted && (query.isBlank() || it.title.contains(query) || it.content.contains(query))
            }.sortedByDescending { it.updatedAt }
        }

    override fun observeNotesByFolder(folderId: String, query: String): Flow<List<NoteEntity>> =
        notes.map { list ->
            list.filter {
                !it.isDeleted &&
                    it.folderId == folderId &&
                    (query.isBlank() || it.title.contains(query) || it.content.contains(query))
            }.sortedByDescending { it.updatedAt }
        }

    override fun observeNotesByTag(tagNeedle: String, query: String): Flow<List<NoteEntity>> =
        notes.map { list ->
            val tag = tagNeedle.trim('"')
            list.filter {
                !it.isDeleted &&
                    it.tags.contains(tag) &&
                    (query.isBlank() || it.title.contains(query) || it.content.contains(query))
            }.sortedByDescending { it.updatedAt }
        }

    override suspend fun upsert(note: NoteEntity) {
        notes.value = notes.value.filterNot { it.id == note.id } + note
    }

    override suspend fun updateText(id: String, title: String, content: String, preview: String, updatedAt: String): Int {
        val existing = notes.value.firstOrNull { it.id == id } ?: return 0
        if (existing.title == title && existing.content == content && existing.preview == preview) return 0
        notes.value = notes.value.map {
            if (it.id == id) it.copy(title = title, content = content, preview = preview, updatedAt = updatedAt) else it
        }
        return 1
    }

    override suspend fun updateFolder(id: String, folderId: String, folderName: String, updatedAt: String): Int {
        val existing = notes.value.firstOrNull { it.id == id } ?: return 0
        if (existing.folderId == folderId && existing.folderName == folderName) return 0
        notes.value = notes.value.map {
            if (it.id == id) it.copy(folderId = folderId, folderName = folderName, updatedAt = updatedAt) else it
        }
        return 1
    }

    override suspend fun updateTags(id: String, tags: List<String>, updatedAt: String): Int {
        val existing = notes.value.firstOrNull { it.id == id } ?: return 0
        if (existing.tags == tags) return 0
        notes.value = notes.value.map {
            if (it.id == id) it.copy(tags = tags, updatedAt = updatedAt) else it
        }
        return 1
    }

    override suspend fun softDelete(id: String, updatedAt: String): Int {
        val existing = notes.value.firstOrNull { it.id == id && !it.isDeleted } ?: return 0
        notes.value = notes.value.map {
            if (it.id == id) it.copy(isDeleted = true, isPinned = false, updatedAt = updatedAt) else it
        }
        return 1
    }

    override suspend fun restore(id: String, updatedAt: String): Int {
        val existing = notes.value.firstOrNull { it.id == id && it.isDeleted } ?: return 0
        notes.value = notes.value.map {
            if (it.id == id) it.copy(isDeleted = false, updatedAt = updatedAt) else it
        }
        return 1
    }
}

private class FakeFolderDao : FolderDao {
    private val folders = MutableStateFlow<List<FolderEntity>>(emptyList())

    override fun observeFolders(): Flow<List<FolderEntity>> = folders

    override suspend fun getFolder(id: String): FolderEntity? = folders.value.firstOrNull { it.id == id }

    override suspend fun upsert(folder: FolderEntity) {
        folders.value = folders.value.filterNot { it.id == folder.id } + folder
    }
}

private class FakeTagDao : TagDao {
    private val tags = MutableStateFlow<List<TagEntity>>(emptyList())

    override fun observeTags(): Flow<List<TagEntity>> = tags

    override suspend fun getTag(id: String): TagEntity? = tags.value.firstOrNull { it.id == id }

    override suspend fun upsert(tag: TagEntity) {
        tags.value = tags.value.filterNot { it.id == tag.id } + tag
    }
}
