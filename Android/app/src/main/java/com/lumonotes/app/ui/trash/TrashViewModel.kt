package com.lumonotes.app.ui.trash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.domain.Note
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TrashViewModel(
    private val repository: NoteRepository,
) : ViewModel() {
    val notes: StateFlow<List<Note>> = repository.observeDeletedNotes()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun restore(id: String) {
        viewModelScope.launch {
            repository.restore(id)
        }
    }

    class Factory(
        private val repository: NoteRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            TrashViewModel(repository) as T
    }
}
