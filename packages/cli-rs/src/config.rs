use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiexConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

fn config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".apiex").join("config.json")
}

pub fn read_config() -> ApiexConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => ApiexConfig::default(),
    }
}

pub fn write_config(config: &ApiexConfig) -> Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(&path, json)?;
    Ok(())
}

pub fn clear_config() -> Result<()> {
    let path = config_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

pub fn get_api_key() -> Result<String> {
    if let Ok(key) = std::env::var("APIEX_API_KEY") {
        if !key.is_empty() {
            return Ok(key);
        }
    }
    let config = read_config();
    config
        .api_key
        .filter(|k| !k.is_empty())
        .ok_or_else(|| anyhow!("No API key found. Run `apiex login` or set APIEX_API_KEY env var."))
}

pub fn get_base_url() -> String {
    if let Ok(url) = std::env::var("APIEX_BASE_URL") {
        if !url.is_empty() {
            return url;
        }
    }
    let config = read_config();
    config
        .base_url
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "http://localhost:3000".to_string())
}
