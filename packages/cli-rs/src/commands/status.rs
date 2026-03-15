use anyhow::Result;
use serde::Deserialize;

use crate::api;

#[derive(Deserialize)]
struct Model {
    id: String,
    owned_by: String,
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<Model>,
}

#[derive(Deserialize)]
struct UsageSummary {
    total_requests: u64,
    total_tokens: u64,
    quota_remaining: i64,
    breakdown: Vec<UsageBreakdown>,
}

#[derive(Deserialize)]
struct UsageBreakdown {
    model_tag: String,
    tokens: u64,
    requests: u64,
}

#[derive(Deserialize)]
struct UsageSummaryResponse {
    data: UsageSummary,
}

pub async fn status_action(json: bool) -> Result<()> {
    let (models_result, usage_result) = tokio::join!(
        api::api_request::<serde_json::Value>("GET", "/v1/models", None::<&()>),
        api::api_request::<serde_json::Value>("GET", "/v1/usage/summary", None::<&()>),
    );

    if json {
        let models_json = match &models_result {
            Ok(r) => r.data.clone(),
            Err(e) => serde_json::json!({ "error": e.to_string() }),
        };
        let usage_json = match &usage_result {
            Ok(r) => r.data.clone(),
            Err(e) => serde_json::json!({ "error": e.to_string() }),
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "models": models_json,
                "usage": usage_json,
            }))?
        );
        return Ok(());
    }

    // Models section
    println!("=== Models ===");
    match models_result {
        Ok(resp) if resp.ok => {
            let models: ModelsResponse = serde_json::from_value(resp.data)?;
            for m in &models.data {
                println!("  {} ({})", m.id, m.owned_by);
            }
        }
        Ok(resp) => {
            println!("  (unavailable — status {})", resp.status);
        }
        Err(e) => {
            println!("  (unavailable — {})", e);
        }
    }

    println!();

    // Usage section
    println!("=== Usage ===");
    match usage_result {
        Ok(resp) if resp.ok => {
            let usage: UsageSummaryResponse = serde_json::from_value(resp.data)?;
            let u = &usage.data;
            println!("  Requests: {}", u.total_requests);
            println!("  Tokens: {}", u.total_tokens);
            if u.quota_remaining == -1 {
                println!("  Quota remaining: unlimited");
            } else {
                println!("  Quota remaining: {}", u.quota_remaining);
            }
            if !u.breakdown.is_empty() {
                println!();
                println!("  Breakdown:");
                for b in &u.breakdown {
                    println!(
                        "    {} — {} tokens, {} requests",
                        b.model_tag, b.tokens, b.requests
                    );
                }
            }
        }
        Ok(resp) => {
            println!("  (unavailable — status {})", resp.status);
        }
        Err(e) => {
            println!("  (unavailable — {})", e);
        }
    }

    Ok(())
}
