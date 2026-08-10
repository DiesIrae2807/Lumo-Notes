package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag

data class LumoBackupPayload(
    val exportedAt: String,
    val notes: List<Note>,
    val folders: List<Folder>,
    val tags: List<String>,
    val noteTags: List<LumoNoteTagPayload>,
)

data class LumoNoteTagPayload(
    val noteId: String,
    val tag: String,
)

data class LumoBackupDecoded(
    val payload: LumoBackupPayload,
    val tagEntities: List<Tag>,
)
