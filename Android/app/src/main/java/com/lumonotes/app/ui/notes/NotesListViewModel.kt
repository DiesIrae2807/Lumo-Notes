package com.lumonotes.app.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
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
    val folderFilter = MutableStateFlow<Folder?>(null)
    val tagFilter = MutableStateFlow<Tag?>(null)

    val folders: StateFlow<List<Folder>> = repository.observeFolders()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val tags: StateFlow<List<Tag>> = repository.observeTags()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val notes: StateFlow<List<Note>> = combineFilters()
        .flatMapLatest { (query, folder, tag) ->
            when {
                folder != null -> repository.observeNotesByFolder(folder.id, query)
                tag != null -> repository.observeNotesByTag(tag.name, query)
                else -> repository.searchActiveNotes(query)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun clearFilters() {
        folderFilter.value = null
        tagFilter.value = null
    }

    fun selectFolder(folder: Folder) {
        folderFilter.value = folder
        tagFilter.value = null
    }

    fun selectTag(tag: Tag) {
        tagFilter.value = tag
        folderFilter.value = null
    }

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

    fun createFolder(name: String) {
        viewModelScope.launch {
            repository.createFolder(name)
        }
    }

    fun createTag(name: String) {
        viewModelScope.launch {
            repository.createTag(name)
        }
    }

    private fun combineFilters() = kotlinx.coroutines.flow.combine(
        searchQuery,
        folderFilter,
        tagFilter,
    ) { query, folder, tag -> Triple(query, folder, tag) }

    class Factory(
        private val repository: NoteRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            NotesListViewModel(repository) as T
    }
}
