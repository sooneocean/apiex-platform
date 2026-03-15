use anyhow::Result;
use serde::Deserialize;

use crate::api;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiKey {
    id: String,
    name: String,
    prefix: String,
    created_at: String,
    #[allow(dead_code)]
    last_used_at: Option<String>,
}

#[derive(Deserialize)]
struct KeysListResponse {
    data: Vec<ApiKey>,
}

#[derive(Deserialize)]
struct KeyCreateResponse {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    name: String,
    key: String,
}

pub async fn list_action(json: bool) -> Result<()> {
    let resp = api::api_request::<serde_json::Value>("GET", "/keys", None::<&()>).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&resp.data)?);
        if !resp.ok {
            std::process::exit(1);
        }
        return Ok(());
    }

    if !resp.ok {
        eprintln!("Error: {}", resp.status);
        std::process::exit(1);
    }

    let list: KeysListResponse = serde_json::from_value(resp.data)?;

    if list.data.is_empty() {
        println!("No API keys found.");
        return Ok(());
    }

    println!(
        "{:<16} {:<16} {:<16} {}",
        "ID", "Name", "Prefix", "Created"
    );
    println!("{}", "─".repeat(64));
    for key in &list.data {
        println!(
            "{:<16} {:<16} {:<16} {}",
            truncate(&key.id, 14),
            truncate(&key.name, 14),
            &key.prefix,
            &key.created_at,
        );
    }

    Ok(())
}

pub async fn create_action(name: &str, json: bool) -> Result<()> {
    let body = serde_json::json!({ "name": name });
    let resp = api::api_request::<serde_json::Value>("POST", "/keys", Some(&body)).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&resp.data)?);
        if !resp.ok {
            std::process::exit(1);
        }
        return Ok(());
    }

    if !resp.ok {
        eprintln!("Error: {}", resp.status);
        std::process::exit(1);
    }

    let created: KeyCreateResponse = serde_json::from_value(resp.data)?;
    println!("Key created: {}", created.key);
    println!("(Save this key — it won't be shown again)");

    Ok(())
}

pub async fn revoke_action(key_id: &str, json: bool) -> Result<()> {
    let path = format!("/keys/{}", key_id);
    let resp = api::api_request::<serde_json::Value>("DELETE", &path, None::<&()>).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&resp.data)?);
        if !resp.ok {
            std::process::exit(1);
        }
        return Ok(());
    }

    if !resp.ok {
        eprintln!("Error: {}", resp.status);
        std::process::exit(1);
    }

    println!("Key {} revoked.", key_id);

    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() > max {
        format!("{}…", &s[..max - 1])
    } else {
        s.to_string()
    }
}
