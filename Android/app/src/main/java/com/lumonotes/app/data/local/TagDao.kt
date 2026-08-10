package com.lumonotes.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TagDao {
    @Query("SELECT * FROM tags ORDER BY name ASC")
    fun observeTags(): Flow<List<TagEntity>>

    @Query("SELECT * FROM tags WHERE id = :id LIMIT 1")
    suspend fun getTag(id: String): TagEntity?

    @Upsert
    suspend fun upsert(tag: TagEntity)
}
