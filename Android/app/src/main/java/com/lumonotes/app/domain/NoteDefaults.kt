package com.lumonotes.app.domain

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

private val ContractTimestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .withZone(ZoneOffset.UTC)

fun contractNow(clock: Clock = Clock.systemUTC()): String =
    ContractTimestampFormatter.format(Instant.now(clock))

fun newNoteId(): String = "note-${UUID.randomUUID()}"

fun plainTextPreview(content: String, maxLength: Int = 160): String =
    content
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(maxLength)

fun createDefaultNote(
    now: String = contractNow(),
    id: String = newNoteId(),
): Note = Note(
    id = id,
    title = "Untitled Note",
    content = "",
    preview = "",
    folderId = "uncategorized",
    folderName = "Uncategorized",
    tags = emptyList(),
    isPinned = false,
    isFavorite = false,
    isDeleted = false,
    isArchived = false,
    isLocked = false,
    encryptedContent = null,
    encryptedPreview = null,
    encryptionNonce = null,
    lockedAt = null,
    createdAt = now,
    updatedAt = now,
)
