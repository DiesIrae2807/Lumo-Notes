package com.lumonotes.app.data.local

import android.content.Context
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LumoDatabaseMigrationTest {
    private lateinit var context: Context
    private val databaseName = "migration-3-4.db"

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.deleteDatabase(databaseName)
    }

    @After
    fun tearDown() {
        context.deleteDatabase(databaseName)
    }

    @Test
    fun migrationThreeToFourPreservesNotesFoldersAndTags() = runBlocking {
        createVersionThreeDatabase()

        val database = Room.databaseBuilder(context, LumoDatabase::class.java, databaseName)
            .addMigrations(LumoDatabase.MIGRATION_3_4)
            .allowMainThreadQueries()
            .build()
        database.openHelper.writableDatabase

        assertEquals("Existing", database.noteDao().getNote("note-existing")?.title)
        assertEquals("Projects", database.folderDao().getFolder("projects")?.name)
        assertEquals("work", database.tagDao().getTag("work")?.name)
        assertTrue(database.syncStateDao().listPending().isEmpty())
        assertTrue(database.syncConflictDao().listUnresolved().isEmpty())
        database.close()
    }

    private fun createVersionThreeDatabase() {
        val configuration = SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(databaseName)
            .callback(
                object : SupportSQLiteOpenHelper.Callback(3) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE notes (
                                id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
                                preview TEXT NOT NULL, folder_id TEXT NOT NULL, folder_name TEXT NOT NULL,
                                tags TEXT NOT NULL DEFAULT '[]', is_pinned INTEGER NOT NULL DEFAULT 0,
                                is_favorite INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0,
                                is_archived INTEGER NOT NULL DEFAULT 0, is_locked INTEGER NOT NULL DEFAULT 0,
                                encrypted_content TEXT, encrypted_preview TEXT, encryption_nonce TEXT, locked_at TEXT,
                                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                            )
                            """.trimIndent(),
                        )
                        db.execSQL("CREATE TABLE folders (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, color_class TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
                        db.execSQL("CREATE TABLE tags (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
                        val timestamp = "2026-07-05T12:34:56.007Z"
                        db.execSQL("INSERT INTO folders VALUES ('projects', 'Projects', 'bg-slate-400', '$timestamp', '$timestamp')")
                        db.execSQL("INSERT INTO tags VALUES ('work', 'work', '$timestamp', '$timestamp')")
                        db.execSQL("INSERT INTO notes VALUES ('note-existing', 'Existing', '', '', 'projects', 'Projects', '[]', 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, '$timestamp', '$timestamp')")
                    }

                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                },
            )
            .build()
        FrameworkSQLiteOpenHelperFactory().create(configuration).use { helper ->
            helper.writableDatabase
        }
    }
}
