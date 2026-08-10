package com.lumonotes.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.lumonotes.app.domain.Folder

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val id: String,
    val name: String,
    @ColumnInfo(name = "color_class") val colorClass: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

fun FolderEntity.toDomain(): Folder = Folder(
    id = id,
    name = name,
    colorClass = colorClass,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun Folder.toEntity(): FolderEntity = FolderEntity(
    id = id,
    name = name,
    colorClass = colorClass,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
