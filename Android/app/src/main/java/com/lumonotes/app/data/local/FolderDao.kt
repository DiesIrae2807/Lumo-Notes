package com.lumonotes.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface FolderDao {
    @Query("SELECT * FROM folders ORDER BY created_at ASC")
    fun observeFolders(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE id = :id LIMIT 1")
    suspend fun getFolder(id: String): FolderEntity?

    @Upsert
    suspend fun upsert(folder: FolderEntity)
}
