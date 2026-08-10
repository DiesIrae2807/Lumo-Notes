
package com.lumonotes.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.data.RoomMutationTransaction
import com.lumonotes.app.data.local.LumoDatabase
import com.lumonotes.app.data.sync.RoomLocalChangeTracker
import com.lumonotes.app.ui.navigation.LumoNavHost
import com.lumonotes.app.ui.theme.LumoTheme

class MainActivity : ComponentActivity() {
    private val repository: NoteRepository by lazy {
        val database = LumoDatabase.getInstance(applicationContext)
        NoteRepository(
            noteDao = database.noteDao(),
            folderDao = database.folderDao(),
            tagDao = database.tagDao(),
            changeTracker = RoomLocalChangeTracker(database.syncStateDao()),
            transaction = RoomMutationTransaction(database),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LumoTheme {
                LumoNavHost(repository = repository)
            }
        }
    }
}
