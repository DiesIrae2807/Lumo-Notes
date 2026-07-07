package com.lumonotes.app.domain

data class Note(
    val id: String,
    val title: String,
    val content: String,
    val preview: String,
    val folderId: String,
    val folderName: String,
    val tags: List<String>,
    val isPinned: Boolean,
    val isFavorite: Boolean,
    val isDeleted: Boolean,
    val isArchived: Boolean,
    val isLocked: Boolean,
    val encryptedContent: String?,
    val encryptedPreview: String?,
    val encryptionNonce: String?,
    val lockedAt: String?,
    val createdAt: String,
    val updatedAt: String,
)
