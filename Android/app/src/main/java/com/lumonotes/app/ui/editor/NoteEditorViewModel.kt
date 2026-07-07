package com.lumonotes.app.ui.editor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.domain.Note
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class NoteEditorViewModel(
    private val repository: NoteRepository,
    noteId: String,
) : ViewModel() {
    val note: StateFlow<Note?> = repository.observeNote(noteId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private var saveJob: Job? = null

    fun scheduleSave(title: String, content: String) {
        val current = note.value ?: return
        if (current.title == title.trim().ifEmpty { "Untitled Note" } && current.content == content) return
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(500)
            repository.saveText(current, title, content)
        }
    }

    fun saveImmediately(title: String, content: String, afterSave: () -> Unit = {}) {
        val current = note.value ?: return afterSave()
        saveJob?.cancel()
        viewModelScope.launch {
            repository.saveText(current, title, content)
            afterSave()
        }
    }

    fun softDelete(onDeleted: () -> Unit) {
        val current = note.value ?: return
        saveJob?.cancel()
        viewModelScope.launch {
            repository.softDelete(current.id)
            onDeleted()
        }
    }

    override fun onCleared() {
        saveJob?.cancel()
        super.onCleared()
    }

    class Factory(
        private val repository: NoteRepository,
        private val noteId: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            NoteEditorViewModel(repository, noteId) as T
    }
}
