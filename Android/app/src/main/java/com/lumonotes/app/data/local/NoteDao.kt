package com.lumonotes.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {
    @Query(
        """
        SELECT * FROM notes
        WHERE is_deleted = 0
        ORDER BY updated_at DESC
        """,
    )
    fun observeActiveNotes(): Flow<List<NoteEntity>>

    @Query(
        """
        SELECT * FROM notes
        WHERE is_deleted = 1
        ORDER BY updated_at DESC
        """,
    )
    fun observeDeletedNotes(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    fun observeNote(id: String): Flow<NoteEntity?>

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    suspend fun getNote(id: String): NoteEntity?

    @Query(
        """
        SELECT * FROM notes
        WHERE is_deleted = 0
          AND (:query = '' OR title LIKE '%' || :query || '%' OR content LIKE '%' || :query || '%')
        ORDER BY updated_at DESC
        """,
    )
    fun searchActiveNotes(query: String): Flow<List<NoteEntity>>

    @Query(
        """
        SELECT * FROM notes
        WHERE is_deleted = 0
          AND folder_id = :folderId
          AND (:query = '' OR title LIKE '%' || :query || '%' OR content LIKE '%' || :query || '%')
        ORDER BY updated_at DESC
        """,
    )
    fun observeNotesByFolder(folderId: String, query: String): Flow<List<NoteEntity>>

    @Query(
        """
        SELECT * FROM notes
        WHERE is_deleted = 0
          AND tags LIKE '%' || :tagNeedle || '%'
          AND (:query = '' OR title LIKE '%' || :query || '%' OR content LIKE '%' || :query || '%')
        ORDER BY updated_at DESC
        """,
    )
    fun observeNotesByTag(tagNeedle: String, query: String): Flow<List<NoteEntity>>

    @Upsert
    suspend fun upsert(note: NoteEntity)

    @Query(
        """
        UPDATE notes
        SET title = :title,
            content = :content,
            preview = :preview,
            updated_at = :updatedAt
        WHERE id = :id AND (title != :title OR content != :content OR preview != :preview)
        """,
    )
    suspend fun updateText(
        id: String,
        title: String,
        content: String,
        preview: String,
        updatedAt: String,
    ): Int

    @Query(
        """
        UPDATE notes
        SET folder_id = :folderId,
            folder_name = :folderName,
            updated_at = :updatedAt
        WHERE id = :id AND (folder_id != :folderId OR folder_name != :folderName)
        """,
    )
    suspend fun updateFolder(id: String, folderId: String, folderName: String, updatedAt: String): Int

    @Query(
        """
        UPDATE notes
        SET tags = :tags,
            updated_at = :updatedAt
        WHERE id = :id AND tags != :tags
        """,
    )
    suspend fun updateTags(id: String, tags: List<String>, updatedAt: String): Int

    @Query(
        """
        UPDATE notes
        SET is_deleted = 1,
            is_pinned = 0,
            updated_at = :updatedAt
        WHERE id = :id AND is_deleted = 0
        """,
    )
    suspend fun softDelete(id: String, updatedAt: String): Int

    @Query(
        """
        UPDATE notes
        SET is_deleted = 0,
            updated_at = :updatedAt
        WHERE id = :id AND is_deleted = 1
        """,
    )
    suspend fun restore(id: String, updatedAt: String): Int
}
