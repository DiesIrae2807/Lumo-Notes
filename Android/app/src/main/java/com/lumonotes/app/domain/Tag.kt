package com.lumonotes.app.domain

data class Tag(
    val id: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String,
)

fun tagIdFor(name: String): String = name.trim().lowercase()
