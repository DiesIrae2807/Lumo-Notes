package com.lumonotes.app.domain

data class Folder(
    val id: String,
    val name: String,
    val colorClass: String,
    val createdAt: String,
    val updatedAt: String,
)

fun createDefaultFolder(now: String = contractNow()): Folder = Folder(
    id = "uncategorized",
    name = "Uncategorized",
    colorClass = "bg-slate-400",
    createdAt = now,
    updatedAt = now,
)

fun newFolderId(name: String): String {
    val slug = name
        .trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
    return slug.ifBlank { "folder-${java.util.UUID.randomUUID()}" }
}
