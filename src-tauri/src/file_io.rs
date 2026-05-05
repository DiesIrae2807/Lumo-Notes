use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub name: String,
    pub path: String,
    pub content: String,
}

fn safe_join_file(directory: PathBuf, filename: &str) -> Result<PathBuf, String> {
    let file_name = PathBuf::from(filename)
        .file_name()
        .ok_or_else(|| "Invalid filename".to_string())?
        .to_owned();
    Ok(directory.join(file_name))
}

#[tauri::command]
pub fn save_text_file(
    title: String,
    default_filename: String,
    content: String,
) -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title(&title)
        .set_file_name(&default_filename)
        .save_file()
    else {
        return Ok(None);
    };

    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn choose_folder_and_write_files(
    title: String,
    files: Vec<ExportFile>,
) -> Result<Option<String>, String> {
    let Some(directory) = rfd::FileDialog::new().set_title(&title).pick_folder() else {
        return Ok(None);
    };

    for file in files {
        let path = safe_join_file(directory.clone(), &file.filename)?;
        fs::write(path, file.content).map_err(|error| error.to_string())?;
    }

    Ok(Some(directory.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_text_files(
    title: String,
    extensions: Vec<String>,
    multiple: bool,
) -> Result<Vec<TextFile>, String> {
    let mut dialog = rfd::FileDialog::new().set_title(&title);

    if !extensions.is_empty() {
        let extension_refs = extensions.iter().map(String::as_str).collect::<Vec<_>>();
        dialog = dialog.add_filter("Supported files", &extension_refs);
    }

    let paths = if multiple {
        dialog.pick_files().unwrap_or_default()
    } else {
        dialog.pick_file().map(|path| vec![path]).unwrap_or_default()
    };

    paths
        .into_iter()
        .map(|path| {
            let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "Imported file".to_string());
            Ok(TextFile {
                name,
                path: path.to_string_lossy().to_string(),
                content,
            })
        })
        .collect()
}
