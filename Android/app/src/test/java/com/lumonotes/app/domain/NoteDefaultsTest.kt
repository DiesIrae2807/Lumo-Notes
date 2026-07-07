package com.lumonotes.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class NoteDefaultsTest {
    @Test
    fun contractNowUsesUtcIsoMilliseconds() {
        val clock = Clock.fixed(Instant.parse("2026-07-05T12:34:56.789Z"), ZoneOffset.UTC)

        assertEquals("2026-07-05T12:34:56.789Z", contractNow(clock))
    }

    @Test
    fun defaultNoteMatchesSharedContractDefaults() {
        val note = createDefaultNote(now = "2026-07-05T12:34:56.789Z", id = "note-test")

        assertEquals("note-test", note.id)
        assertEquals("Untitled Note", note.title)
        assertEquals("uncategorized", note.folderId)
        assertEquals("Uncategorized", note.folderName)
        assertTrue(note.tags.isEmpty())
        assertFalse(note.isDeleted)
        assertFalse(note.isPinned)
        assertFalse(note.isLocked)
        assertEquals(note.createdAt, note.updatedAt)
    }

    @Test
    fun plainTextPreviewNormalizesWhitespaceAndLimitsLength() {
        val preview = plainTextPreview("  First\n\nSecond\tThird  ", maxLength = 12)

        assertEquals("First Second", preview)
    }
}
