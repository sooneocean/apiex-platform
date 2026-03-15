use anyhow::Result;
use std::io::{self, BufRead, Write};

use crate::config;

pub async fn login_action(json: bool) -> Result<()> {
    let base_url = config::get_base_url();
    let admin_url = format!("{}/admin", base_url);

    if json {
        println!(
            "{}",
            serde_json::json!({ "action": "login", "adminUrl": admin_url })
        );
    } else {
        println!("Open the admin panel to get your API Key:");
        println!("  {}", admin_url);
        println!();
        print!("Paste your API Key: ");
        io::stdout().flush()?;
    }

    let mut key = String::new();
    io::stdin().lock().read_line(&mut key)?;
    let key = key.trim().to_string();

    if key.is_empty() {
        eprintln!("No API Key provided. Aborting.");
        std::process::exit(1);
    }

    let mut cfg = config::read_config();
    cfg.api_key = Some(key);
    config::write_config(&cfg)?;

    if json {
        println!(
            "{}",
            serde_json::json!({ "status": "ok", "message": "API Key saved" })
        );
    } else {
        println!("API Key saved to ~/.apiex/config.json");
    }

    Ok(())
}

pub async fn logout_action(json: bool) -> Result<()> {
    config::clear_config()?;

    if json {
        println!(
            "{}",
            serde_json::json!({ "status": "ok", "message": "Logged out" })
        );
    } else {
        println!("Logged out. Config removed.");
    }

    Ok(())
}
