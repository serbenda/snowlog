// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Snowlog desktop: it only opens the window with the web app. It exposes no command to JavaScript
// (no IPC of its own and no plugins), so the web app cannot touch the system beyond what it could
// do in a browser.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("could not open Snowlog");
}
