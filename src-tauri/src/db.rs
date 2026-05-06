use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct DbState {
    pub path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    pub id: String,
    pub name: String,
    pub color_class: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub title: String,
    pub content: String,
    pub preview: String,
    pub folder_id: String,
    pub folder_name: String,
    pub tags: Vec<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub is_deleted: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSnapshot {
    pub notes: Vec<NoteDto>,
    pub folders: Vec<FolderDto>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingDto {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

fn connect(path: &PathBuf) -> Result<Connection, String> {
    Connection::open(path).map_err(|error| error.to_string())
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.join("lumo-notes.db"))
}

fn create_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                preview TEXT NOT NULL,
                folder_id TEXT NOT NULL,
                folder_name TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(folder_id) REFERENCES folders(id)
            );

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (note_id, tag_id),
                FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())
}

fn seed_database_if_empty(connection: &mut Connection) -> Result<(), String> {
    let note_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    if note_count > 0 {
        return Ok(());
    }

    let folders = seed_folders();
    let notes = seed_notes();
    let transaction = connection.transaction().map_err(|error| error.to_string())?;

    for folder in &folders {
        transaction
            .execute(
                "INSERT INTO folders (id, name, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    folder.id,
                    folder.name,
                    folder.color_class,
                    "2026-05-04T00:00:00.000Z",
                    "2026-05-04T00:00:00.000Z"
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for note in &notes {
        insert_note(&transaction, note)?;
    }

    transaction.commit().map_err(|error| error.to_string())
}

fn insert_note(connection: &Connection, note: &NoteDto) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO notes (
                id, title, content, preview, folder_id, folder_name,
                is_pinned, is_favorite, is_deleted, created_at, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                note.id,
                note.title,
                note.content,
                note.preview,
                note.folder_id,
                note.folder_name,
                note.is_pinned as i64,
                note.is_favorite as i64,
                note.is_deleted as i64,
                note.created_at,
                note.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;

    replace_note_tags(connection, note)
}

fn replace_note_tags(connection: &Connection, note: &NoteDto) -> Result<(), String> {
    connection
        .execute("DELETE FROM note_tags WHERE note_id = ?1", params![note.id])
        .map_err(|error| error.to_string())?;

    for tag in &note.tags {
        let tag_id = tag.to_lowercase();
        connection
            .execute(
                "INSERT OR IGNORE INTO tags (id, name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![tag_id, tag, note.created_at, note.updated_at],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note.id, tag_id],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn tag_id_for(name: &str) -> String {
    name.trim().to_lowercase()
}

fn resolve_tag_id(connection: &Connection, name: &str) -> Result<String, String> {
    let normalized = tag_id_for(name);
    connection
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 OR id = ?2 LIMIT 1",
            params![name.trim(), normalized],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| format!("Tag '{}' does not exist", name))
}

fn ensure_uncategorized_folder(connection: &Connection, updated_at: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO folders (id, name, color, created_at, updated_at)
             VALUES ('uncategorized', 'Uncategorized', 'bg-slate-400', ?1, ?1)",
            params![updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn get_notes_from_connection(connection: &Connection) -> Result<Vec<NoteDto>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT
                id, title, content, preview, folder_id, folder_name,
                is_pinned, is_favorite, is_deleted, created_at, updated_at
            FROM notes
            ORDER BY updated_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let note_id: String = row.get(0)?;
            let tags = get_tags_for_note(connection, &note_id)?;

            Ok(NoteDto {
                id: note_id,
                title: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                folder_id: row.get(4)?,
                folder_name: row.get(5)?,
                is_pinned: row.get::<_, i64>(6)? != 0,
                is_favorite: row.get::<_, i64>(7)? != 0,
                is_deleted: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn get_folders_from_connection(connection: &Connection) -> Result<Vec<FolderDto>, String> {
    let mut statement = connection
        .prepare("SELECT id, name, color FROM folders ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(FolderDto {
                id: row.get(0)?,
                name: row.get(1)?,
                color_class: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn get_tags_from_connection(connection: &Connection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT name FROM tags ORDER BY name ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn get_tags_for_note(connection: &Connection, note_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare(
        "
        SELECT tags.name
        FROM tags
        INNER JOIN note_tags ON note_tags.tag_id = tags.id
        WHERE note_tags.note_id = ?1
        ORDER BY tags.name ASC
        ",
    )?;
    let rows = statement.query_map(params![note_id], |row| row.get::<_, String>(0))?;

    rows.collect()
}

#[tauri::command]
pub fn initialize_database(state: tauri::State<'_, DbState>) -> Result<DatabaseSnapshot, String> {
    let mut connection = connect(&state.path)?;
    create_schema(&connection)?;
    seed_database_if_empty(&mut connection)?;
    Ok(DatabaseSnapshot {
        notes: get_notes_from_connection(&connection)?,
        folders: get_folders_from_connection(&connection)?,
        tags: get_tags_from_connection(&connection)?,
    })
}

#[tauri::command]
pub fn get_notes(state: tauri::State<'_, DbState>) -> Result<Vec<NoteDto>, String> {
    let connection = connect(&state.path)?;
    get_notes_from_connection(&connection)
}

#[tauri::command]
pub fn get_folders(state: tauri::State<'_, DbState>) -> Result<Vec<FolderDto>, String> {
    let connection = connect(&state.path)?;
    get_folders_from_connection(&connection)
}

#[tauri::command]
pub fn get_tags(state: tauri::State<'_, DbState>) -> Result<Vec<String>, String> {
    let connection = connect(&state.path)?;
    get_tags_from_connection(&connection)
}

#[tauri::command]
pub fn get_app_settings(state: tauri::State<'_, DbState>) -> Result<Vec<SettingDto>, String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    let mut statement = connection
        .prepare("SELECT key, value, updated_at FROM app_settings ORDER BY key")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(SettingDto {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_app_setting(
    state: tauri::State<'_, DbState>,
    key: String,
    value: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    connection
        .execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_note(state: tauri::State<'_, DbState>, note: NoteDto) -> Result<(), String> {
    let connection = connect(&state.path)?;
    insert_note(&connection, &note)
}

#[tauri::command]
pub fn update_note(state: tauri::State<'_, DbState>, note: NoteDto) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes
             SET title = ?2, content = ?3, preview = ?4, folder_id = ?5, folder_name = ?6,
                 is_pinned = ?7, is_favorite = ?8, is_deleted = ?9, updated_at = ?10
             WHERE id = ?1",
            params![
                note.id,
                note.title,
                note.content,
                note.preview,
                note.folder_id,
                note.folder_name,
                note.is_pinned as i64,
                note.is_favorite as i64,
                note.is_deleted as i64,
                note.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    replace_note_tags(&connection, &note)
}

#[tauri::command]
pub fn soft_delete_note(
    state: tauri::State<'_, DbState>,
    id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes SET is_deleted = 1, is_pinned = 0, updated_at = ?2 WHERE id = ?1",
            params![id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_note(
    state: tauri::State<'_, DbState>,
    id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes SET is_deleted = 0, updated_at = ?2 WHERE id = ?1",
            params![id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn permanently_delete_note(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "DELETE FROM note_tags WHERE note_id = ?1
             AND EXISTS (SELECT 1 FROM notes WHERE notes.id = ?1 AND notes.is_deleted = 1)",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM notes WHERE id = ?1 AND is_deleted = 1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn permanently_delete_trashed_notes(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "DELETE FROM note_tags
             WHERE note_id IN (SELECT id FROM notes WHERE is_deleted = 1)",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM notes WHERE is_deleted = 1", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_favorite(
    state: tauri::State<'_, DbState>,
    id: String,
    is_favorite: bool,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes SET is_favorite = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, is_favorite as i64, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pinned(
    state: tauri::State<'_, DbState>,
    id: String,
    is_pinned: bool,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes SET is_pinned = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, is_pinned as i64, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_folder(
    state: tauri::State<'_, DbState>,
    folder: FolderDto,
    created_at: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "INSERT INTO folders (id, name, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![folder.id, folder.name, folder.color_class, created_at, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_folder(
    state: tauri::State<'_, DbState>,
    id: String,
    name: String,
    color_class: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE folders SET name = ?2, color = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, name, color_class, updated_at],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE notes SET folder_name = ?2, updated_at = ?3 WHERE folder_id = ?1",
            params![id, name, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(
    state: tauri::State<'_, DbState>,
    id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    ensure_uncategorized_folder(&connection, &updated_at)?;
    connection
        .execute(
            "UPDATE notes
             SET folder_id = 'uncategorized', folder_name = 'Uncategorized', updated_at = ?2
             WHERE folder_id = ?1",
            params![id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM folders WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_note_folder(
    state: tauri::State<'_, DbState>,
    note_id: String,
    folder_id: String,
    folder_name: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    connection
        .execute(
            "UPDATE notes SET folder_id = ?2, folder_name = ?3, updated_at = ?4 WHERE id = ?1",
            params![note_id, folder_id, folder_name, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_tag(
    state: tauri::State<'_, DbState>,
    name: String,
    created_at: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let tag_id = tag_id_for(&name);
    connection
        .execute(
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![tag_id, name.trim(), created_at, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_tag(
    state: tauri::State<'_, DbState>,
    old_name: String,
    new_name: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let old_id = resolve_tag_id(&connection, &old_name)?;
    connection
        .execute(
            "UPDATE tags SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![old_id, new_name.trim(), updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_tag(state: tauri::State<'_, DbState>, name: String) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let tag_id = resolve_tag_id(&connection, &name)?;
    connection
        .execute("DELETE FROM note_tags WHERE tag_id = ?1", params![tag_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_tag_to_note(
    state: tauri::State<'_, DbState>,
    note_id: String,
    tag_name: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let tag_id = tag_id_for(&tag_name);
    connection
        .execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)",
            params![tag_id, tag_name.trim(), updated_at],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, tag_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE notes SET updated_at = ?2 WHERE id = ?1",
            params![note_id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_note(
    state: tauri::State<'_, DbState>,
    note_id: String,
    tag_name: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let tag_id = resolve_tag_id(&connection, &tag_name)?;
    connection
        .execute(
            "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
            params![note_id, tag_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE notes SET updated_at = ?2 WHERE id = ?1",
            params![note_id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn seed_folders() -> Vec<FolderDto> {
    vec![
        FolderDto {
            id: "projects".into(),
            name: "Projects".into(),
            color_class: "bg-lumo-violet".into(),
        },
        FolderDto {
            id: "personal".into(),
            name: "Personal".into(),
            color_class: "bg-lumo-teal".into(),
        },
        FolderDto {
            id: "ideas".into(),
            name: "Ideas".into(),
            color_class: "bg-emerald-300".into(),
        },
        FolderDto {
            id: "learning".into(),
            name: "Learning".into(),
            color_class: "bg-violet-400".into(),
        },
        FolderDto {
            id: "archive".into(),
            name: "Archive".into(),
            color_class: "bg-indigo-200".into(),
        },
    ]
}

fn seed_notes() -> Vec<NoteDto> {
    vec![
        NoteDto {
            id: "note-project-aurora".into(),
            title: "Project Aurora".into(),
            content: "Vision\nCreate a calm, intelligent note-taking experience that helps people think clearly and stay connected.\n\nGoals\nDelightful and minimal experience\nPowerful linking and knowledge capture\nClear structure across devices\nPrivate, focused, and reliable\n\nRoadmap\nDefine MVP scope\nUser research\nWireframes and prototype\nBuild core linking experience\nBeta release".into(),
            preview: "Product vision, goals, and roadmap".into(),
            folder_id: "projects".into(),
            folder_name: "Projects".into(),
            tags: vec!["work".into(), "product".into()],
            is_pinned: true,
            is_favorite: true,
            is_deleted: false,
            created_at: "2026-04-25T10:00:00.000Z".into(),
            updated_at: "2026-05-04T21:58:00.000Z".into(),
        },
        NoteDto {
            id: "note-branding-ideas".into(),
            title: "Branding Ideas".into(),
            content: "Color, typography, style, and moodboard notes for the next Lumo identity pass.".into(),
            preview: "Color, typography, style, moodboard".into(),
            folder_id: "personal".into(),
            folder_name: "Personal".into(),
            tags: vec!["design".into(), "personal".into()],
            is_pinned: true,
            is_favorite: false,
            is_deleted: false,
            created_at: "2026-04-29T10:00:00.000Z".into(),
            updated_at: "2026-05-04T21:00:00.000Z".into(),
        },
        NoteDto {
            id: "note-design-system".into(),
            title: "Design system exploration".into(),
            content: "Explore compact panels, restrained color tokens, focus states, and editor controls.".into(),
            preview: "Color, typography, components".into(),
            folder_id: "projects".into(),
            folder_name: "Projects".into(),
            tags: vec!["design".into(), "product".into()],
            is_pinned: false,
            is_favorite: false,
            is_deleted: false,
            created_at: "2026-05-01T10:00:00.000Z".into(),
            updated_at: "2026-05-04T18:00:00.000Z".into(),
        },
        NoteDto {
            id: "note-user-interviews".into(),
            title: "User interviews".into(),
            content: "People want capture to feel fast, calm, and reliable. Organization should emerge without heavy setup.".into(),
            preview: "What users need, learnings, gratitude".into(),
            folder_id: "personal".into(),
            folder_name: "Personal".into(),
            tags: vec!["personal".into(), "product".into()],
            is_pinned: false,
            is_favorite: true,
            is_deleted: false,
            created_at: "2026-05-02T10:00:00.000Z".into(),
            updated_at: "2026-05-04T16:00:00.000Z".into(),
        },
        NoteDto {
            id: "note-marketing-strategy".into(),
            title: "Marketing strategy".into(),
            content: "Positioning, messaging, and channels for the first public Lumo Notes story.".into(),
            preview: "Positioning, messaging, channels".into(),
            folder_id: "projects".into(),
            folder_name: "Projects".into(),
            tags: vec!["work".into(), "planning".into()],
            is_pinned: false,
            is_favorite: false,
            is_deleted: false,
            created_at: "2026-04-30T10:00:00.000Z".into(),
            updated_at: "2026-05-03T10:00:00.000Z".into(),
        },
    ]
}
