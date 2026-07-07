package com.lumonotes.app.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.domain.Note
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class NotesListViewModel(
    private val repository: NoteRepository,
) : ViewModel() {
    val searchQuery = MutableStateFlow("")

    val notes: StateFlow<List<Note>> = searchQuery
        .flatMapLatest { query -> repository.searchActiveNotes(query) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun createNote(onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val note = repository.createNote()
            onCreated(note.id)
        }
    }

    fun softDelete(id: String) {
        viewModelScope.launch {
            repository.softDelete(id)
        }
    }

    class Factory(
        private val repository: NoteRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            NotesListViewModel(repository) as T
    }
}
