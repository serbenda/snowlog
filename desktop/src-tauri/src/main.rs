// Snowlog de escritorio: solo abre la ventana con la web. No expone ninguna orden al JavaScript
// (sin IPC propio ni plugins), así que la web no puede tocar el sistema más allá de lo que haría
// en un navegador.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se ha podido abrir Snowlog");
}
