package com.lumonotes.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.lumonotes.app.domain.Tag

@Entity(tableName = "tags")
data class TagEntity(
    @PrimaryKey val id: String,
    val name: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

fun TagEntity.toDomain(): Tag = Tag(
    id = id,
    name = name,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun Tag.toEntity(): TagEntity = TagEntity(
    id = id,
    name = name,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
