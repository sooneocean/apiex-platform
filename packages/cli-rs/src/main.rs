mod api;
mod config;
mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "apiex", about = "Apiex Platform CLI", version = "0.1.0")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output as JSON
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with the Apiex platform
    Login,
    /// Remove stored credentials
    Logout,
    /// Send a chat completion request
    Chat {
        /// The prompt to send
        prompt: String,
        /// Model tag (e.g. apex-smart, apex-cheap)
        #[arg(long)]
        model: String,
    },
    /// Manage API keys
    Keys {
        #[command(subcommand)]
        action: KeysAction,
    },
    /// Show available models and usage summary
    Status,
}

#[derive(Subcommand)]
enum KeysAction {
    /// List all API keys
    List,
    /// Create a new API key
    Create {
        /// Name for the new key
        #[arg(long)]
        name: String,
    },
    /// Revoke an API key
    Revoke {
        /// The key ID to revoke
        key_id: String,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Login => commands::login::login_action(cli.json).await,
        Commands::Logout => commands::login::logout_action(cli.json).await,
        Commands::Chat { prompt, model } => {
            commands::chat::chat_action(&prompt, &model, cli.json).await
        }
        Commands::Keys { action } => match action {
            KeysAction::List => commands::keys::list_action(cli.json).await,
            KeysAction::Create { name } => commands::keys::create_action(&name, cli.json).await,
            KeysAction::Revoke { key_id } => {
                commands::keys::revoke_action(&key_id, cli.json).await
            }
        },
        Commands::Status => commands::status::status_action(cli.json).await,
    };

    if let Err(e) = result {
        if cli.json {
            eprintln!(
                "{}",
                serde_json::json!({ "error": e.to_string() })
            );
        } else {
            eprintln!("Error: {}", e);
        }
        std::process::exit(1);
    }
}
