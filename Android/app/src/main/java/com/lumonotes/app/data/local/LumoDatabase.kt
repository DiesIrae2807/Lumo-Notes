package com.lumonotes.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [NoteEntity::class],
    version = 2,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class LumoDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao

    companion object {
        @Volatile
        private var instance: LumoDatabase? = null

        fun getInstance(context: Context): LumoDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    LumoDatabase::class.java,
                    "lumo-notes.db",
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE notes_new (
                        id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        preview TEXT NOT NULL,
                        folder_id TEXT NOT NULL,
                        folder_name TEXT NOT NULL,
                        tags TEXT NOT NULL DEFAULT '[]',
                        is_pinned INTEGER NOT NULL DEFAULT 0,
                        is_favorite INTEGER NOT NULL DEFAULT 0,
                        is_deleted INTEGER NOT NULL DEFAULT 0,
                        is_archived INTEGER NOT NULL DEFAULT 0,
                        is_locked INTEGER NOT NULL DEFAULT 0,
                        encrypted_content TEXT,
                        encrypted_preview TEXT,
                        encryption_nonce TEXT,
                        locked_at TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    INSERT INTO notes_new (
                        id, title, content, preview, folder_id, folder_name, tags,
                        is_pinned, is_favorite, is_deleted, is_archived, is_locked,
                        encrypted_content, encrypted_preview, encryption_nonce, locked_at,
                        created_at, updated_at
                    )
                    SELECT
                        id, title, content, preview, folder_id, folder_name, COALESCE(tags, '[]'),
                        is_pinned, is_favorite, is_deleted, is_archived, is_locked,
                        encrypted_content, encrypted_preview, encryption_nonce, locked_at,
                        created_at, updated_at
                    FROM notes
                    """.trimIndent(),
                )
                db.execSQL("DROP TABLE notes")
                db.execSQL("ALTER TABLE notes_new RENAME TO notes")
            }
        }
    }
}
