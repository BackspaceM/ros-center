use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Listener, Manager, State};

pub struct AppState {
    child: Mutex<Option<Child>>,
    port: Mutex<u16>,
}

fn settings_path() -> PathBuf {
    let base = if cfg!(windows) {
        env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dirs_home())
            .join("ROS Center")
    } else {
        dirs_home().join(".ros-center")
    };
    base.join("desktop-settings.json")
}

fn dirs_home() -> PathBuf {
    PathBuf::from(env::var("HOME").or_else(|_| env::var("USERPROFILE")).unwrap_or_else(|_| ".".into()))
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct DesktopSettings {
    close_to_tray: bool,
}
impl Default for DesktopSettings {
    fn default() -> Self { Self { close_to_tray: true } }
}

fn load_settings() -> DesktopSettings {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn save_settings(s: &DesktopSettings) {
    let p = settings_path();
    if let Some(d) = p.parent() { let _ = fs::create_dir_all(d); }
    let _ = fs::write(&p, serde_json::to_string_pretty(s).unwrap_or_default());
}

#[tauri::command]
fn get_close_to_tray() -> bool { load_settings().close_to_tray }
#[tauri::command]
fn set_close_to_tray(value: bool) { let mut s = load_settings(); s.close_to_tray = value; save_settings(&s); }
#[tauri::command]
fn get_server_port(state: State<'_, AppState>) -> u16 { *state.port.lock().unwrap() }
fn kill_server(state: &State<'_, AppState>) {
    if let Some(c) = state.child.lock().unwrap().as_mut() { let _ = c.kill(); }
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    let st: State<'_, AppState> = app.state();
    kill_server(&st);
    app.exit(0);
}

fn resource_dir(app: &tauri::AppHandle) -> PathBuf {
    /* 本地调试/绿色版可用环境变量覆盖资源目录 */
    if let Ok(p) = env::var("ROS_TAURI_RESOURCES") { return PathBuf::from(p); }
    app.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(p) = env::var("ROS_TAURI_DATA") { return PathBuf::from(p); }
    let res = resource_dir(app);
    /* 绿色版：resources 里带 data/；安装版：用系统数据目录 */
    let portable = res.join("data");
    if portable.exists() { return portable; }
    if cfg!(windows) {
        env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| dirs_home())
            .join("ROS Center")
    } else {
        dirs_home().join("Library").join("Application Support").join("ROS Center")
    }
}

fn sync_app_files(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let res = resource_dir(app);
    let src = res.join("app");
    let data = data_dir(app);
    let dst = data.join("app");
    fs::create_dir_all(&dst).map_err(|e| e.to_string())?;
    /* 首次或 version.json 变化时同步程序源码（保留 data 其它内容） */
    let need = !dst.join("server.js").exists()
        || fs::read_to_string(src.join("version.json")).ok()
            != fs::read_to_string(dst.join("version.json")).ok();
    if need {
        copy_dir(&src, &dst)?;
    }
    Ok(dst)
}

fn copy_dir(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    for e in fs::read_dir(src).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let to = dst.join(e.file_name());
        if e.path().is_dir() {
            fs::create_dir_all(&to).map_err(|x| x.to_string())?;
            copy_dir(&e.path(), &to)?;
        } else {
            fs::copy(e.path(), &to).map_err(|x| x.to_string())?;
        }
    }
    Ok(())
}

fn probe_port(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn wait_for_server(deadline: Duration) -> Option<u16> {
    let t0 = Instant::now();
    while t0.elapsed() < deadline {
        for p in 10086..10096u16 {
            if probe_port(p) {
                /* 用 /api/health 确认是 ROS Center，避免误连别的服务 */
                if let Ok(mut s) = TcpStream::connect(("127.0.0.1", p)) {
                    use std::io::Write;
                    let _ = s.write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n");
                    let mut r = BufReader::new(s);
                    let mut line = String::new();
                    let _ = r.read_line(&mut line);
                    if line.contains("200") { return Some(p); }
                }
            }
        }
        thread::sleep(Duration::from_millis(300));
    }
    None
}

fn spawn_server(app: &tauri::AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    let res = resource_dir(app);
    let app_dir = sync_app_files(app)?;
    let (node, launcher) = if cfg!(windows) {
        (res.join("bin").join("node.exe"), app_dir.join("launcher.js"))
    } else {
        (res.join("bin").join("node"), app_dir.join("launcher.js"))
    };
    if !node.exists() { return Err(format!("内置运行时缺失: {}", node.display())); }
    if !launcher.exists() { return Err(format!("程序文件缺失: {}", launcher.display())); }

    let data = data_dir(app);
    let mut cmd = Command::new(&node);
    cmd.arg(&launcher)
        .current_dir(&app_dir)
        .env("ROS_BASE_DIR", &data)
        .env("ROS_DESKTOP", "1")
        .env("HOST", "127.0.0.1")
        .env("ROS_NO_BROWSER", "1")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        /* CREATE_NO_WINDOW：彻底消除 CMD 黑框 */
        cmd.creation_flags(0x08000000);
    }
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    *state.child.lock().unwrap() = Some(child);
    Ok(())
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/* Windows：检测 WebView2 Runtime 是否安装；缺失时引导用户安装。
   NSIS 安装器已配置 webview2=download，这里是绿色版/运行时的兜底。 */
#[cfg(windows)]
fn ensure_webview2() {
    use std::process::Command;
    let installed = Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"])
        .output().map(|o| o.status.success()).unwrap_or(false)
        || Command::new("reg")
        .args(["query", r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"])
        .output().map(|o| o.status.success()).unwrap_or(false);
    if !installed {
        eprintln!("[ros-center] 未检测到 WebView2 Runtime，正在打开安装引导页");
        let _ = Command::new("cmd")
            .args(["/c", "start", "", "https://go.microsoft.com/fwlink/p/?LinkId=2124703"])
            .spawn();
    }
}
#[cfg(not(windows))]
fn ensure_webview2() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState { child: Mutex::new(None), port: Mutex::new(10086) })
        .invoke_handler(tauri::generate_handler![
            get_close_to_tray, set_close_to_tray, get_server_port, quit_app
        ])
        .setup(|app| {
            ensure_webview2();
            let handle = app.handle().clone();
            let state: State<'_, AppState> = app.state();
            if let Err(e) = spawn_server(&handle, &state) {
                eprintln!("[ros-center] 启动服务失败: {}", e);
            }
            let port = wait_for_server(Duration::from_secs(30)).unwrap_or(10086);
            *state.port.lock().unwrap() = port;

            let win = app.get_webview_window("main").unwrap();
            let url = format!("http://127.0.0.1:{}", port);
            let _ = win.navigate(url.parse::<tauri::Url>().unwrap());

            /* 关闭策略：默认最小化到托盘（每次读取设置，WebUI 改后立即生效） */
            let w = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if load_settings().close_to_tray {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                }
            });

            /* 托盘：左键显示，菜单「打开 / 退出」 */
            let open = MenuItem::with_id(&handle, "open", "打开 ROS Center", true, None::<&str>).unwrap();
            let quit = MenuItem::with_id(&handle, "quit", "退出", true, None::<&str>).unwrap();
            let sep = PredefinedMenuItem::separator(&handle).unwrap();
            let menu = Menu::with_items(&handle, &[&open, &sep, &quit]).unwrap();
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "open" => show_window(app),
                    "quit" => {
                        let st: State<'_, AppState> = app.state();
                        kill_server(&st);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_window(tray.app_handle());
                    }
                })
                .build(&handle).unwrap();
            let _ = tray;

            /* 退出时 kill 本地服务子进程（兜底；菜单退出已主动 kill） */
            let h = handle.clone();
            app.listen("tauri://destroyed", move |_| {
                let st: State<'_, AppState> = h.state();
                kill_server(&st);
            });

            show_window(&handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ROS Center");
}
