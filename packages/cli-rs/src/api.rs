use anyhow::{anyhow, Result};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::config;

#[derive(Debug)]
pub struct ApiResponse<T> {
    pub ok: bool,
    pub status: u16,
    pub data: T,
}

pub async fn api_request<T: DeserializeOwned>(
    method: &str,
    path: &str,
    body: Option<&impl Serialize>,
) -> Result<ApiResponse<T>> {
    let api_key = config::get_api_key()?;
    let base_url = config::get_base_url();
    let url = format!("{}{}", base_url, path);

    let http_method = match method.to_uppercase().as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "DELETE" => Method::DELETE,
        "PUT" => Method::PUT,
        "PATCH" => Method::PATCH,
        _ => return Err(anyhow!("Unsupported HTTP method: {}", method)),
    };

    let client = reqwest::Client::new();
    let mut req = client
        .request(http_method, &url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    if let Some(b) = body {
        req = req.json(b);
    }

    let response = req.send().await.map_err(|e| anyhow!("Request failed: {}", e))?;
    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let data: T = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

    Ok(ApiResponse { ok, status, data })
}
