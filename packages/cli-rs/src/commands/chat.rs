use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::api;

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    #[allow(dead_code)]
    id: String,
    choices: Vec<Choice>,
    usage: Option<Usage>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChatMessage,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

pub async fn chat_action(prompt: &str, model: &str, json: bool) -> Result<()> {
    let body = ChatRequest {
        model: model.to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
    };

    let resp = api::api_request::<serde_json::Value>("POST", "/v1/chat/completions", Some(&body)).await?;

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

    let chat: ChatResponse = serde_json::from_value(resp.data)?;

    let content = chat
        .choices
        .first()
        .map(|c| c.message.content.as_str())
        .unwrap_or("(no response)");

    println!("{}", content);

    if let Some(usage) = &chat.usage {
        println!(
            "\n[tokens: {} in / {} out / {} total]",
            usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
        );
    }

    Ok(())
}
