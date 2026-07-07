package com.lumonotes.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.data.local.LumoDatabase
import com.lumonotes.app.ui.navigation.LumoNavHost
import com.lumonotes.app.ui.theme.LumoTheme

class MainActivity : ComponentActivity() {
    private val repository: NoteRepository by lazy {
        NoteRepository(LumoDatabase.getInstance(applicationContext).noteDao())
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
