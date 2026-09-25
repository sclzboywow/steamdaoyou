use serde::Serialize;
use tauri::State;

#[cfg(feature = "steamworks-native")]
use std::sync::{mpsc, Mutex};
#[cfg(feature = "steamworks-native")]
use std::time::{Duration, Instant};
#[cfg(feature = "steamworks-native")]
use steamworks::{Client, TicketForWebApiResponse};

#[derive(Default)]
struct SteamRuntime {
    #[cfg(feature = "steamworks-native")]
    client: Mutex<Option<(u32, Client)>>,
    #[cfg(feature = "steamworks-native")]
    ticket_lock: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamTicketPayload {
    app_id: u32,
    steam_id: String,
    persona_name: String,
    ticket: String,
    identity: String,
}

#[cfg(feature = "steamworks-native")]
fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(feature = "steamworks-native")]
fn native_webapi_ticket(
    state: State<'_, SteamRuntime>,
    app_id: u32,
    identity: String,
) -> Result<SteamTicketPayload, String> {
    if app_id == 0 {
        return Err("Steam AppID 不能为 0".into());
    }
    if identity.trim().is_empty() {
        return Err("Steam Web API identity 不能为空".into());
    }

    let _ticket_guard = state
        .ticket_lock
        .lock()
        .map_err(|_| "Steam Ticket 锁异常")?;

    let client = {
        let mut guard = state.client.lock().map_err(|_| "Steam 状态锁异常")?;
        match guard.as_ref() {
            Some((existing_app_id, client)) if *existing_app_id == app_id => client.clone(),
            Some((existing_app_id, _)) => {
                return Err(format!(
                    "Steam 已按 AppID {} 初始化，不能切换到 {}",
                    existing_app_id, app_id
                ))
            }
            None => {
                let client = Client::init_app(app_id)
                    .map_err(|error| format!("Steamworks 初始化失败：{error}"))?;
                *guard = Some((app_id, client.clone()));
                client
            }
        }
    };

    let steam_id = client.user().steam_id().raw().to_string();
    let persona_name = client.friends().name();
    let (sender, receiver) = mpsc::sync_channel::<Result<Vec<u8>, String>>(1);
    let _callback = client.register_callback(move |event: TicketForWebApiResponse| {
        let result = event
            .result
            .map_err(|error| format!("Steam Ticket 生成失败：{error}"))
            .map(|_| {
                let len = event.ticket_len.max(0) as usize;
                event.ticket.into_iter().take(len).collect::<Vec<_>>()
            });
        let _ = sender.send(result);
    });

    let ticket_handle = client
        .user()
        .authentication_session_ticket_for_webapi(identity.trim());
    let deadline = Instant::now() + Duration::from_secs(8);
    let bytes = loop {
        client.run_callbacks();
        match receiver.try_recv() {
            Ok(result) => break result?,
            Err(mpsc::TryRecvError::Disconnected) => {
                client.user().cancel_authentication_ticket(ticket_handle);
                return Err("Steam Ticket 回调已断开".into());
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        if Instant::now() >= deadline {
            client.user().cancel_authentication_ticket(ticket_handle);
            return Err("等待 Steam Ticket 超时".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    };

    client.user().cancel_authentication_ticket(ticket_handle);
    if bytes.is_empty() {
        return Err("Steam 返回了空 Ticket".into());
    }

    Ok(SteamTicketPayload {
        app_id,
        steam_id,
        persona_name,
        ticket: to_hex(&bytes),
        identity: identity.trim().to_owned(),
    })
}

#[tauri::command]
fn steam_get_webapi_ticket(
    state: State<'_, SteamRuntime>,
    app_id: u32,
    identity: String,
) -> Result<SteamTicketPayload, String> {
    #[cfg(feature = "steamworks-native")]
    {
        return native_webapi_ticket(state, app_id, identity);
    }

    #[cfg(not(feature = "steamworks-native"))]
    {
        let _ = (state, app_id, identity);
        Err("当前客户端未启用 steamworks-native；本地开发请开启 Steam mock，正式构建请使用 steam:build。".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SteamRuntime::default())
        .invoke_handler(tauri::generate_handler![steam_get_webapi_ticket])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
