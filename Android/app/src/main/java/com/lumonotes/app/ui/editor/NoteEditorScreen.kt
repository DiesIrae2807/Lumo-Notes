package com.lumonotes.app.ui.editor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lumonotes.app.ui.common.displayDate

@Composable
fun NoteEditorScreen(
    viewModel: NoteEditorViewModel,
    onBack: () -> Unit,
    onDeleted: () -> Unit,
) {
    val note by viewModel.note.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val availableTags by viewModel.tags.collectAsState()
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var newTag by remember { mutableStateOf("") }
    var newFolder by remember { mutableStateOf("") }

    LaunchedEffect(note?.id) {
        val current = note ?: return@LaunchedEffect
        title = current.title
        content = current.content
    }

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { viewModel.saveImmediately(title, content, onBack) }) {
                    Text("Back")
                }
                Text(
                    text = "Edit note",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                TextButton(enabled = note != null, onClick = { viewModel.softDelete(onDeleted) }) {
                    Text("Delete")
                }
            }

            val current = note
            if (current == null) {
                Spacer(Modifier.height(24.dp))
                Text("Note not found")
                return@Column
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    text = "Autosaves locally · Updated ${displayDate(current.updatedAt)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = {
                        title = it
                        viewModel.scheduleSave(title, content)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Title") },
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = content,
                    onValueChange = {
                        content = it
                        viewModel.scheduleSave(title, content)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(280.dp),
                    label = { Text("Note") },
                )
                Spacer(Modifier.height(18.dp))
                Text("Folder", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    folders.forEach { folder ->
                        FilterChip(
                            selected = current.folderId == folder.id,
                            onClick = { viewModel.assignFolder(folder.id) },
                            label = { Text(folder.name) },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newFolder,
                        onValueChange = { newFolder = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        label = { Text("New folder") },
                    )
                    TextButton(enabled = newFolder.isNotBlank(), onClick = {
                        viewModel.createFolder(newFolder)
                        newFolder = ""
                    }) {
                        Text("Add")
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text("Tags", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    current.tags.forEach { tag ->
                        AssistChip(
                            onClick = { viewModel.removeTag(tag) },
                            label = { Text("#$tag  ×") },
                        )
                    }
                    availableTags
                        .filterNot { available -> current.tags.any { it.equals(available.name, ignoreCase = true) } }
                        .forEach { tag ->
                            AssistChip(onClick = { viewModel.addTag(tag.name) }, label = { Text("#${tag.name}") })
                        }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newTag,
                        onValueChange = { newTag = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        label = { Text("Add tag") },
                    )
                    TextButton(enabled = newTag.isNotBlank(), onClick = {
                        viewModel.addTag(newTag)
                        newTag = ""
                    }) {
                        Text("Add")
                    }
                }
            }
        }
    }
}
