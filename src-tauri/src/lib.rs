mod db;
mod file_io;

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
            db::archive_note,
            db::unarchive_note,
            db::permanently_delete_note,
            db::permanently_delete_trashed_notes,
            db::toggle_favorite,
            db::toggle_pinned,
            db::get_folders,
            db::get_tags,
            db::get_attachments,
            db::search_notes,
            db::rebuild_search_index,
            db::attach_file_to_note,
            db::remove_attachment,
            db::open_attachment,
            db::save_attachment_as,
            db::get_attachment_data_url,
            db::get_app_settings,
            db::set_app_setting,
            db::create_folder,
            db::update_folder,
            db::delete_folder,
            db::set_note_folder,
            db::create_tag,
            db::update_tag,
            db::delete_tag,
            db::add_tag_to_note,
            db::remove_tag_from_note,
            file_io::save_text_file,
            file_io::choose_folder_and_write_files,
            file_io::open_text_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumo Notes");
}
