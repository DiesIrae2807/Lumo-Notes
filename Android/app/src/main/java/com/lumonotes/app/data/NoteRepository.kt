package com.lumonotes.app.data

import com.lumonotes.app.data.local.NoteDao
import com.lumonotes.app.data.local.toDomain
import com.lumonotes.app.data.local.toEntity
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.contractNow
import com.lumonotes.app.domain.createDefaultNote
import com.lumonotes.app.domain.plainTextPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class NoteRepository(
    private val noteDao: NoteDao,
) {
    fun observeActiveNotes(): Flow<List<Note>> =
        noteDao.observeActiveNotes().map { notes -> notes.map { it.toDomain() } }

    fun observeDeletedNotes(): Flow<List<Note>> =
        noteDao.observeDeletedNotes().map { notes -> notes.map { it.toDomain() } }

    fun observeNote(id: String): Flow<Note?> =
        noteDao.observeNote(id).map { it?.toDomain() }

    fun searchActiveNotes(query: String): Flow<List<Note>> =
        noteDao.searchActiveNotes(query.trim()).map { notes -> notes.map { it.toDomain() } }

    suspend fun createNote(): Note {
        val note = createDefaultNote()
        noteDao.upsert(note.toEntity())
        return note
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
}
