package com.lumonotes.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lumonotes.app.data.NoteRepository
import com.lumonotes.app.ui.editor.NoteEditorScreen
import com.lumonotes.app.ui.editor.NoteEditorViewModel
import com.lumonotes.app.ui.notes.NotesListScreen
import com.lumonotes.app.ui.notes.NotesListViewModel
import com.lumonotes.app.ui.settings.SettingsScreen
import com.lumonotes.app.ui.trash.TrashScreen
import com.lumonotes.app.ui.trash.TrashViewModel

object Routes {
    const val Notes = "notes"
    const val Trash = "trash"
    const val Settings = "settings"
    const val Editor = "editor/{noteId}"

    fun editor(noteId: String): String = "editor/$noteId"
}

@Composable
fun LumoNavHost(
    repository: NoteRepository,
    navController: NavHostController = rememberNavController(),
) {
    NavHost(
        navController = navController,
        startDestination = Routes.Notes,
    ) {
        composable(Routes.Notes) {
            val viewModel: NotesListViewModel = viewModel(
                factory = NotesListViewModel.Factory(repository),
            )
            NotesListScreen(
                viewModel = viewModel,
                onOpenNote = { navController.navigate(Routes.editor(it)) },
                onOpenSettings = { navController.navigate(Routes.Settings) },
                onOpenTrash = { navController.navigate(Routes.Trash) },
            )
        }

        composable(
            route = Routes.Editor,
            arguments = listOf(navArgument("noteId") { type = NavType.StringType }),
        ) { entry ->
            val noteId = checkNotNull(entry.arguments?.getString("noteId"))
            val viewModel: NoteEditorViewModel = viewModel(
                key = "editor-$noteId",
                factory = NoteEditorViewModel.Factory(repository, noteId),
            )
            NoteEditorScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onDeleted = {
                    navController.popBackStack(Routes.Notes, inclusive = false)
                },
            )
        }

        composable(Routes.Trash) {
            val viewModel: TrashViewModel = viewModel(
                factory = TrashViewModel.Factory(repository),
            )
            TrashScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.Settings) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
            )
        }
    }
}
