mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = db::database_path(app.handle())?;
            app.manage(db::DbState { path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::initialize_database,
            db::get_notes,
            db::create_note,
            db::update_note,
            db::soft_delete_note,
            db::restore_note,
            db::toggle_favorite,
            db::toggle_pinned,
            db::get_folders,
            db::get_tags,
            db::create_folder,
            db::update_folder,
            db::delete_folder,
            db::set_note_folder,
            db::create_tag,
            db::update_tag,
            db::delete_tag,
            db::add_tag_to_note,
            db::remove_tag_from_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumo Notes");
}
