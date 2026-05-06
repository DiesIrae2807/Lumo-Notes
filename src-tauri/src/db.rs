use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDto {
    pub id: String,
    pub note_id: String,
    pub filename: String,
    pub original_path: Option<String>,
    pub stored_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSnapshot {
    pub notes: Vec<NoteDto>,
    pub folders: Vec<FolderDto>,
    pub tags: Vec<String>,
    pub attachments: Vec<AttachmentDto>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingDto {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
    pub note_id: String,
    pub score: f64,
    pub snippet: String,
}

fn connect(path: &PathBuf) -> Result<Connection, String> {
    Connection::open(path).map_err(|error| error.to_string())
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
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

            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                original_path TEXT,
                stored_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
            );
            ",
        )
        .map_err(|error| error.to_string())
}

fn create_search_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                note_id UNINDEXED,
                title,
                preview,
                content,
                folder_name,
                tags,
                attachments
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
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

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

fn get_attachment_names_for_note(
    connection: &Connection,
    note_id: &str,
) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare(
        "
        SELECT filename
        FROM attachments
        WHERE note_id = ?1
        ORDER BY filename ASC
        ",
    )?;
    let rows = statement.query_map(params![note_id], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn get_note_ids_for_tag_id(connection: &Connection, tag_id: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT note_id
            FROM note_tags
            WHERE tag_id = ?1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![tag_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn get_note_ids_for_folder_id(
    connection: &Connection,
    folder_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT id
            FROM notes
            WHERE folder_id = ?1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![folder_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn upsert_search_index_notes(connection: &Connection, note_ids: &[String]) -> Result<(), String> {
    for note_id in note_ids {
        upsert_search_index_note(connection, note_id)?;
    }
    Ok(())
}

fn upsert_search_index_note(connection: &Connection, note_id: &str) -> Result<(), String> {
    create_search_schema(connection)?;
    let note = connection
        .query_row(
            "
            SELECT id, title, content, preview, folder_name
            FROM notes
            WHERE id = ?1
            ",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    connection
        .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;

    if let Some((id, title, content, preview, folder_name)) = note {
        let tags = get_tags_for_note(connection, &id)
            .map_err(|error| error.to_string())?
            .join(" ");
        let attachments = get_attachment_names_for_note(connection, &id)
            .map_err(|error| error.to_string())?
            .join(" ");
        connection
            .execute(
                "
                INSERT INTO notes_fts (note_id, title, preview, content, folder_name, tags, attachments)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ",
                params![id, title, preview, content, folder_name, tags, attachments],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn rebuild_search_index_from_connection(connection: &Connection) -> Result<(), String> {
    create_search_schema(connection)?;
    connection
        .execute("DELETE FROM notes_fts", [])
        .map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare("SELECT id FROM notes")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let note_ids = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);

    for note_id in note_ids {
        upsert_search_index_note(connection, &note_id)?;
    }

    Ok(())
}

fn get_attachments_from_connection(connection: &Connection) -> Result<Vec<AttachmentDto>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, note_id, filename, original_path, stored_path, mime_type, file_size, created_at
            FROM attachments
            ORDER BY created_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(AttachmentDto {
                id: row.get(0)?,
                note_id: row.get(1)?,
                filename: row.get(2)?,
                original_path: row.get(3)?,
                stored_path: row.get(4)?,
                mime_type: row.get(5)?,
                file_size: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn attachment_by_id(connection: &Connection, id: &str) -> Result<Option<AttachmentDto>, String> {
    connection
        .query_row(
            "
            SELECT id, note_id, filename, original_path, stored_path, mime_type, file_size, created_at
            FROM attachments
            WHERE id = ?1
            ",
            params![id],
            |row| {
                Ok(AttachmentDto {
                    id: row.get(0)?,
                    note_id: row.get(1)?,
                    filename: row.get(2)?,
                    original_path: row.get(3)?,
                    stored_path: row.get(4)?,
                    mime_type: row.get(5)?,
                    file_size: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn unix_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| error.to_string())
}

fn attachment_id() -> Result<String, String> {
    Ok(format!("attachment-{}", unix_millis()?))
}

fn sanitize_file_name(value: &str) -> String {
    let clean = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            value if value.is_control() => ' ',
            value => value,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if clean.is_empty() {
        "attachment".to_string()
    } else {
        clean.chars().take(90).collect()
    }
}

fn mime_type_for(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" | "markdown" => "text/markdown",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn stored_attachment_paths_for_note(
    connection: &Connection,
    note_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT attachments.stored_path
            FROM attachments
            INNER JOIN notes ON notes.id = attachments.note_id
            WHERE attachments.note_id = ?1 AND notes.is_deleted = 1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![note_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn stored_attachment_paths_for_trashed_notes(
    connection: &Connection,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "
            SELECT attachments.stored_path
            FROM attachments
            INNER JOIN notes ON notes.id = attachments.note_id
            WHERE notes.is_deleted = 1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn remove_files(paths: Vec<String>) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

fn fts_query(value: &str) -> String {
    value
        .split_whitespace()
        .map(|part| {
            part.chars()
                .filter(|character| character.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|part| !part.is_empty())
        .map(|part| format!("{}*", part.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn plain_snippet(value: &str, _query: &str) -> String {
    let source = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let characters = source.chars().collect::<Vec<_>>();
    if characters.len() <= 150 {
        return source;
    }

    let mut snippet = characters.iter().take(150).collect::<String>();
    snippet = snippet.trim().to_string();
    snippet.push_str("...");
    snippet
}

#[tauri::command]
pub fn initialize_database(state: tauri::State<'_, DbState>) -> Result<DatabaseSnapshot, String> {
    let mut connection = connect(&state.path)?;
    create_schema(&connection)?;
    seed_database_if_empty(&mut connection)?;
    let _ = rebuild_search_index_from_connection(&connection);
    Ok(DatabaseSnapshot {
        notes: get_notes_from_connection(&connection)?,
        folders: get_folders_from_connection(&connection)?,
        tags: get_tags_from_connection(&connection)?,
        attachments: get_attachments_from_connection(&connection)?,
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
pub fn get_attachments(state: tauri::State<'_, DbState>) -> Result<Vec<AttachmentDto>, String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    get_attachments_from_connection(&connection)
}

#[tauri::command]
pub fn rebuild_search_index(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    rebuild_search_index_from_connection(&connection)
}

#[tauri::command]
pub fn search_notes(
    state: tauri::State<'_, DbState>,
    query: String,
    include_deleted: bool,
) -> Result<Vec<SearchResultDto>, String> {
    let normalized = fts_query(&query);
    if normalized.is_empty() {
        return Ok(vec![]);
    }

    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    create_search_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "
            SELECT
                notes.id,
                notes.title,
                notes.preview,
                notes.content,
                notes.folder_name,
                notes.updated_at,
                notes.is_pinned,
                bm25(notes_fts, -8.0, -4.0, -1.0, -3.0, -3.0, -2.0) AS rank_score
            FROM notes_fts
            INNER JOIN notes ON notes.id = notes_fts.note_id
            WHERE notes_fts MATCH ?1
              AND notes.is_deleted = ?2
            ORDER BY rank_score ASC, notes.is_pinned DESC, notes.updated_at DESC
            LIMIT 100
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![normalized, include_deleted as i64], |row| {
            let note_id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let preview: String = row.get(2)?;
            let content: String = row.get(3)?;
            let folder_name: String = row.get(4)?;
            let is_pinned: i64 = row.get(6)?;
            let rank_score: f64 = row.get(7)?;
            let title_boost = if title.to_lowercase().contains(&query.to_lowercase()) {
                80.0
            } else {
                0.0
            };
            let folder_boost = if folder_name.to_lowercase().contains(&query.to_lowercase()) {
                40.0
            } else {
                0.0
            };
            let pin_boost = if is_pinned != 0 { 8.0 } else { 0.0 };
            let score =
                (1000.0 - rank_score.abs()).max(0.0) + title_boost + folder_boost + pin_boost;
            let snippet_source = if !preview.trim().is_empty() {
                preview
            } else {
                content
            };
            Ok(SearchResultDto {
                note_id,
                score,
                snippet: plain_snippet(&snippet_source, &query),
            })
        })
        .map_err(|error| error.to_string())?;

    let mut results = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(results)
}

#[tauri::command]
pub fn attach_file_to_note(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    note_id: String,
    created_at: String,
) -> Result<Option<AttachmentDto>, String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    let note_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM notes WHERE id = ?1 AND is_deleted = 0)",
            params![note_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        != 0;

    if !note_exists {
        return Err("Select an active note before attaching a file.".to_string());
    }

    let Some(source_path) = rfd::FileDialog::new()
        .set_title("Attach file")
        .add_filter(
            "Supported files",
            &["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "md"],
        )
        .pick_file()
    else {
        return Ok(None);
    };

    let metadata = fs::metadata(&source_path).map_err(|error| error.to_string())?;
    let original_filename = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let filename = sanitize_file_name(original_filename);
    let id = attachment_id()?;
    let stored_filename = format!("{}-{}", id, filename);
    let stored_path = attachments_dir(&app)?.join(stored_filename);
    fs::copy(&source_path, &stored_path).map_err(|error| error.to_string())?;

    let attachment = AttachmentDto {
        id,
        note_id,
        filename,
        original_path: Some(source_path.to_string_lossy().to_string()),
        stored_path: stored_path.to_string_lossy().to_string(),
        mime_type: mime_type_for(&source_path),
        file_size: metadata.len() as i64,
        created_at,
    };

    connection
        .execute(
            "INSERT INTO attachments (
                id, note_id, filename, original_path, stored_path, mime_type, file_size, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &attachment.id,
                &attachment.note_id,
                &attachment.filename,
                attachment.original_path.as_deref(),
                &attachment.stored_path,
                &attachment.mime_type,
                attachment.file_size,
                &attachment.created_at
            ],
        )
        .map_err(|error| error.to_string())?;

    let _ = upsert_search_index_note(&connection, &attachment.note_id);
    Ok(Some(attachment))
}

#[tauri::command]
pub fn remove_attachment(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    if let Some(attachment) = attachment_by_id(&connection, &id)? {
        let note_id = attachment.note_id.clone();
        connection
            .execute("DELETE FROM attachments WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        let _ = fs::remove_file(attachment.stored_path);
        let _ = upsert_search_index_note(&connection, &note_id);
    }
    Ok(())
}

#[tauri::command]
pub fn open_attachment(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    let Some(attachment) = attachment_by_id(&connection, &id)? else {
        return Err("Attachment not found.".to_string());
    };

    if !Path::new(&attachment.stored_path).exists() {
        return Err("Attachment file is missing from local storage.".to_string());
    }

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", "", &attachment.stored_path])
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(&attachment.stored_path)
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(&attachment.stored_path)
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Could not open attachment with the default app.".to_string())
    }
}

#[tauri::command]
pub fn get_attachment_data_url(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    let connection = connect(&state.path)?;
    create_schema(&connection)?;
    let Some(attachment) = attachment_by_id(&connection, &id)? else {
        return Err("Attachment not found.".to_string());
    };

    if !attachment.mime_type.starts_with("image/") {
        return Err("Attachment is not an image.".to_string());
    }

    let bytes = fs::read(&attachment.stored_path).map_err(|error| error.to_string())?;
    Ok(format!(
        "data:{};base64,{}",
        attachment.mime_type,
        base64_encode(&bytes)
    ))
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
    insert_note(&connection, &note)?;
    let _ = upsert_search_index_note(&connection, &note.id);
    Ok(())
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
    replace_note_tags(&connection, &note)?;
    let _ = upsert_search_index_note(&connection, &note.id);
    Ok(())
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
    let _ = upsert_search_index_note(&connection, &id);
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
    let _ = upsert_search_index_note(&connection, &id);
    Ok(())
}

#[tauri::command]
pub fn permanently_delete_note(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let attachment_paths = stored_attachment_paths_for_note(&connection, &id)?;
    connection
        .execute(
            "DELETE FROM note_tags WHERE note_id = ?1
             AND EXISTS (SELECT 1 FROM notes WHERE notes.id = ?1 AND notes.is_deleted = 1)",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM attachments WHERE note_id = ?1
             AND NOT EXISTS (SELECT 1 FROM notes WHERE notes.id = ?1 AND notes.is_deleted = 0)",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM notes WHERE id = ?1 AND is_deleted = 1",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    remove_files(attachment_paths);
    let _ = rebuild_search_index_from_connection(&connection);
    Ok(())
}

#[tauri::command]
pub fn permanently_delete_trashed_notes(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let connection = connect(&state.path)?;
    let attachment_paths = stored_attachment_paths_for_trashed_notes(&connection)?;
    connection
        .execute(
            "DELETE FROM note_tags
             WHERE note_id IN (SELECT id FROM notes WHERE is_deleted = 1)",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM attachments
             WHERE note_id IN (SELECT id FROM notes WHERE is_deleted = 1)",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM notes WHERE is_deleted = 1", [])
        .map_err(|error| error.to_string())?;
    remove_files(attachment_paths);
    let _ = rebuild_search_index_from_connection(&connection);
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
    let _ = upsert_search_index_note(&connection, &id);
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
    let _ = upsert_search_index_note(&connection, &id);
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
            params![
                folder.id,
                folder.name,
                folder.color_class,
                created_at,
                updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    let _ = rebuild_search_index_from_connection(&connection);
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
    let note_ids = get_note_ids_for_folder_id(&connection, &id)?;
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
    let _ = upsert_search_index_notes(&connection, &note_ids);
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
    let _ = rebuild_search_index_from_connection(&connection);
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
    let _ = upsert_search_index_note(&connection, &note_id);
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
    let affected_note_ids = get_note_ids_for_tag_id(&connection, &old_id)?;
    connection
        .execute(
            "UPDATE tags SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![old_id, new_name.trim(), updated_at],
        )
        .map_err(|error| error.to_string())?;
    let _ = upsert_search_index_notes(&connection, &affected_note_ids);
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
    let _ = rebuild_search_index_from_connection(&connection);
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
    let _ = upsert_search_index_note(&connection, &note_id);
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
    let _ = upsert_search_index_note(&connection, &note_id);
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
