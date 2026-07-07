package com.lumonotes.app.ui.notes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import com.lumonotes.app.ui.common.displayDate

private enum class NotesSection { All, Folders, Tags }

@Composable
fun NotesListScreen(
    viewModel: NotesListViewModel,
    onOpenNote: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenTrash: () -> Unit,
) {
    val notes by viewModel.notes.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val tags by viewModel.tags.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val folderFilter by viewModel.folderFilter.collectAsState()
    val tagFilter by viewModel.tagFilter.collectAsState()
    var section by remember { mutableStateOf(NotesSection.All) }
    var newFolder by remember { mutableStateOf("") }
    var newTag by remember { mutableStateOf("") }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = section == NotesSection.All,
                    onClick = {
                        section = NotesSection.All
                        viewModel.clearFilters()
                    },
                    label = { Text("All Notes") },
                    icon = { Text("•") },
                )
                NavigationBarItem(
                    selected = section == NotesSection.Folders,
                    onClick = { section = NotesSection.Folders },
                    label = { Text("Folders") },
                    icon = { Text("□") },
                )
                NavigationBarItem(
                    selected = section == NotesSection.Tags,
                    onClick = { section = NotesSection.Tags },
                    label = { Text("Tags") },
                    icon = { Text("#") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenTrash,
                    label = { Text("Trash") },
                    icon = { Text("⌫") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenSettings,
                    label = { Text("Settings") },
                    icon = { Text("⚙") },
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = when {
                            folderFilter != null -> folderFilter?.name.orEmpty()
                            tagFilter != null -> "#${tagFilter?.name.orEmpty()}"
                            else -> "Lumo Notes"
                        },
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${notes.size} ${if (notes.size == 1) "note" else "notes"}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                FilledTonalButton(onClick = { viewModel.createNote(onOpenNote) }) {
                    Text("New")
                }
            }

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { viewModel.searchQuery.value = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Search notes") },
            )
            Spacer(Modifier.height(12.dp))

            when (section) {
                NotesSection.All -> {
                    if (folderFilter != null || tagFilter != null) {
                        TextButton(onClick = viewModel::clearFilters) {
                            Text("Show all notes")
                        }
                    }
                }
                NotesSection.Folders -> FolderSection(
                    folders = folders,
                    selected = folderFilter,
                    newFolder = newFolder,
                    onNewFolderChange = { newFolder = it },
                    onCreate = {
                        viewModel.createFolder(newFolder)
                        newFolder = ""
                    },
                    onSelect = {
                        viewModel.selectFolder(it)
                        section = NotesSection.Folders
                    },
                )
                NotesSection.Tags -> TagSection(
                    tags = tags,
                    selected = tagFilter,
                    newTag = newTag,
                    onNewTagChange = { newTag = it },
                    onCreate = {
                        viewModel.createTag(newTag)
                        newTag = ""
                    },
                    onSelect = {
                        viewModel.selectTag(it)
                        section = NotesSection.Tags
                    },
                )
            }

            Spacer(Modifier.height(8.dp))
            if (notes.isEmpty()) {
                EmptyNotes(
                    hasSearch = searchQuery.isNotBlank(),
                    folder = folderFilter,
                    tag = tagFilter,
                    onCreate = { viewModel.createNote(onOpenNote) },
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(notes, key = { it.id }) { note ->
                        NoteRow(
                            note = note,
                            onOpen = { onOpenNote(note.id) },
                            onDelete = { viewModel.softDelete(note.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FolderSection(
    folders: List<Folder>,
    selected: Folder?,
    newFolder: String,
    onNewFolderChange: (String) -> Unit,
    onCreate: () -> Unit,
    onSelect: (Folder) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        folders.forEach { folder ->
            AssistChip(
                onClick = { onSelect(folder) },
                label = { Text(folder.name) },
                enabled = selected?.id != folder.id,
            )
        }
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = newFolder,
            onValueChange = onNewFolderChange,
            modifier = Modifier.weight(1f),
            singleLine = true,
            label = { Text("New folder") },
        )
        TextButton(enabled = newFolder.isNotBlank(), onClick = onCreate) {
            Text("Add")
        }
    }
}

@Composable
private fun TagSection(
    tags: List<Tag>,
    selected: Tag?,
    newTag: String,
    onNewTagChange: (String) -> Unit,
    onCreate: () -> Unit,
    onSelect: (Tag) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        tags.forEach { tag ->
            AssistChip(
                onClick = { onSelect(tag) },
                label = { Text("#${tag.name}") },
                enabled = selected?.id != tag.id,
            )
        }
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = newTag,
            onValueChange = onNewTagChange,
            modifier = Modifier.weight(1f),
            singleLine = true,
            label = { Text("New tag") },
        )
        TextButton(enabled = newTag.isNotBlank(), onClick = onCreate) {
            Text("Add")
        }
    }
}

@Composable
private fun EmptyNotes(
    hasSearch: Boolean,
    folder: Folder?,
    tag: Tag?,
    onCreate: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = when {
                hasSearch -> "No matching notes"
                folder != null -> "This folder is empty"
                tag != null -> "No notes with this tag"
                else -> "No notes yet"
            },
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(12.dp))
        if (!hasSearch) {
            FilledTonalButton(onClick = onCreate) {
                Text("Create note")
            }
        }
    }
}

@Composable
private fun NoteRow(
    note: Note,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = note.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = displayDate(note.updatedAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = onDelete) {
                    Text("Delete")
                }
            }
            if (note.preview.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = note.preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                AssistChip(onClick = {}, label = { Text(note.folderName) })
                note.tags.take(3).forEach { tag ->
                    AssistChip(onClick = {}, label = { Text("#$tag") })
                }
            }
        }
    }
}
