package com.lumonotes.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.lumonotes.app.data.sync.local.PendingChangeEntity
import com.lumonotes.app.data.sync.local.SeenChangeEntity
import com.lumonotes.app.data.sync.local.SyncConflictDao
import com.lumonotes.app.data.sync.local.SyncConflictEntity
import com.lumonotes.app.data.sync.local.SyncStateDao
import com.lumonotes.app.data.sync.local.UploadedChangeEntity

@Database(
    entities = [
        NoteEntity::class,
        FolderEntity::class,
        TagEntity::class,
        SeenChangeEntity::class,
        UploadedChangeEntity::class,
        PendingChangeEntity::class,
        SyncConflictEntity::class,
    ],
    version = 4,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class LumoDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao
    abstract fun folderDao(): FolderDao
    abstract fun tagDao(): TagDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun syncConflictDao(): SyncConflictDao

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
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
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

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS folders (
                        id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        color_class TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS tags (
                        id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    INSERT OR IGNORE INTO folders (id, name, color_class, created_at, updated_at)
                    VALUES ('uncategorized', 'Uncategorized', 'bg-slate-400', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z')
                    """.trimIndent(),
                )
            }
        }

        internal val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_seen_changes (
                        change_id TEXT NOT NULL,
                        applied_at TEXT NOT NULL,
                        remote_device_id TEXT,
                        PRIMARY KEY(change_id)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_uploaded_changes (
                        change_id TEXT NOT NULL,
                        uploaded_at TEXT NOT NULL,
                        PRIMARY KEY(change_id)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_pending_changes (
                        `key` TEXT NOT NULL,
                        entity_type TEXT NOT NULL,
                        entity_id TEXT NOT NULL,
                        operation TEXT NOT NULL,
                        source_updated_at TEXT NOT NULL,
                        state_fingerprint TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        PRIMARY KEY(`key`)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_sync_pending_changes_entity_type_entity_id ON sync_pending_changes (entity_type, entity_id)",
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_conflicts (
                        id TEXT NOT NULL,
                        entity_type TEXT NOT NULL,
                        entity_id TEXT NOT NULL,
                        local_payload TEXT NOT NULL,
                        remote_payload TEXT NOT NULL,
                        local_updated_at TEXT,
                        remote_created_at TEXT,
                        local_device_id TEXT,
                        remote_device_id TEXT,
                        remote_change_id TEXT NOT NULL,
                        detected_at TEXT NOT NULL,
                        status TEXT NOT NULL,
                        resolution TEXT,
                        resolved_at TEXT,
                        result_entity_id TEXT,
                        resolution_synced_at TEXT,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent(),
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_sync_conflicts_remote_change_id ON sync_conflicts (remote_change_id)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_conflicts_status ON sync_conflicts (status)")
            }
        }
    }
}
