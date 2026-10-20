// NameDaemon desktop: tray, native notifications, file save, keyring and the second window with the website's tools.
// The window's logic is in ../ui/js. Only the main window may call these commands and plugins (see capabilities/main.json).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;

const KEYRING_SERVICE: &str = "com.namedaemon.desktop";
const KEYRING_USER: &str = "api-key";
const TOOLS_URL_ORIGIN: &str = "https://namedaemon.com";

#[derive(Default)]
struct HideOnClose(AtomicBool);

struct TrayItems {
    open: MenuItem<Wry>,
    clipboard: MenuItem<Wry>,
    tools: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(Default)]
struct TrayState(Mutex<Option<TrayItems>>);

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Only the website's app pages and domain report pages may be opened, with simple paths (letters, digits, dash, slash).
fn allowed_path(path: &str) -> bool {
    (path.starts_with("/app/") || path.starts_with("/domain/"))
        && path.len() <= 120
        && !path.contains("//")
        && path.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '/' || c == '-')
}

#[tauri::command]
fn open_tools(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let path = path.unwrap_or_else(|| "/app/".to_string());
    if !allowed_path(&path) {
        return Err("path not allowed".into());
    }
    let url: tauri::Url = format!("{}{}", TOOLS_URL_ORIGIN, path).parse().map_err(|_| "bad url".to_string())?;
    if let Some(w) = app.get_webview_window("tools") {
        let _ = w.navigate(url);
        let _ = w.show();
        return w.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "tools", WebviewUrl::External(url))
        .title("NameDaemon tools")
        .inner_size(1100.0, 800.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hide_on_close(state: tauri::State<HideOnClose>, hide: bool) {
    state.0.store(hide, Ordering::Relaxed);
}

#[tauri::command]
fn set_tray_labels(state: tauri::State<TrayState>, open: String, clipboard: String, tools: String, quit: String) {
    if let Some(items) = state.0.lock().unwrap().as_ref() {
        let _ = items.open.set_text(open);
        let _ = items.clipboard.set_text(clipboard);
        let _ = items.tools.set_text(tools);
        let _ = items.quit.set_text(quit);
    }
}

/// Writes the CSV the person just chose a path for in the save dialog.
#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".csv") {
        return Err("only .csv files can be saved".into());
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_api_key() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(p),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    if key.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&key).map_err(|e| e.to_string())
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open NameDaemon", true, None::<&str>)?;
    let clipboard = MenuItem::with_id(app, "clipboard", "Check the name in the clipboard", true, None::<&str>)?;
    let tools = MenuItem::with_id(app, "tools", "Open all tools", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &clipboard, &tools, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("NameDaemon")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "tools" => {
                let _ = open_tools(app.clone(), None);
            }
            "clipboard" => {
                let text = app.clipboard().read_text().unwrap_or_default();
                show_main(app);
                if !text.trim().is_empty() {
                    let _ = app.emit_to("main", "clipboard-name", text);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    *app.state::<TrayState>().0.lock().unwrap() = Some(TrayItems { open, clipboard, tools, quit });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(HideOnClose::default())
        .manage(TrayState::default())
        .invoke_handler(tauri::generate_handler![open_tools, set_hide_on_close, set_tray_labels, save_text_file, get_api_key, set_api_key])
        .setup(|app| {
            build_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && window.app_handle().state::<HideOnClose>().0.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NameDaemon");
}
