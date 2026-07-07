package com.lumonotes.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.lumonotes.app.domain.Note

@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val content: String,
    val preview: String,
    @ColumnInfo(name = "folder_id") val folderId: String,
    @ColumnInfo(name = "folder_name") val folderName: String,
    @ColumnInfo(defaultValue = "'[]'") val tags: List<String>,
    @ColumnInfo(name = "is_pinned", defaultValue = "0") val isPinned: Boolean = false,
    @ColumnInfo(name = "is_favorite", defaultValue = "0") val isFavorite: Boolean = false,
    @ColumnInfo(name = "is_deleted", defaultValue = "0") val isDeleted: Boolean = false,
    @ColumnInfo(name = "is_archived", defaultValue = "0") val isArchived: Boolean = false,
    @ColumnInfo(name = "is_locked", defaultValue = "0") val isLocked: Boolean = false,
    @ColumnInfo(name = "encrypted_content") val encryptedContent: String? = null,
    @ColumnInfo(name = "encrypted_preview") val encryptedPreview: String? = null,
    @ColumnInfo(name = "encryption_nonce") val encryptionNonce: String? = null,
    @ColumnInfo(name = "locked_at") val lockedAt: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

fun NoteEntity.toDomain(): Note = Note(
    id = id,
    title = title,
    content = content,
    preview = preview,
    folderId = folderId,
    folderName = folderName,
    tags = tags,
    isPinned = isPinned,
    isFavorite = isFavorite,
    isDeleted = isDeleted,
    isArchived = isArchived,
    isLocked = isLocked,
    encryptedContent = encryptedContent,
    encryptedPreview = encryptedPreview,
    encryptionNonce = encryptionNonce,
    lockedAt = lockedAt,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun Note.toEntity(): NoteEntity = NoteEntity(
    id = id,
    title = title,
    content = content,
    preview = preview,
    folderId = folderId,
    folderName = folderName,
    tags = tags,
    isPinned = isPinned,
    isFavorite = isFavorite,
    isDeleted = isDeleted,
    isArchived = isArchived,
    isLocked = isLocked,
    encryptedContent = encryptedContent,
    encryptedPreview = encryptedPreview,
    encryptionNonce = encryptionNonce,
    lockedAt = lockedAt,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
