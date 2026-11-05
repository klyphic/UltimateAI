# UltimateAI

**ForgetMeAI × FAST**

OpenAI-compatible API proxy for DeepSeek Web Chat.

UltimateAI exposes an API server for DeepSeek Web Chat (chat.deepseek.com). It supports OpenAI Chat Completions, OpenAI Responses, and an Anthropic Messages-compatible endpoint. Integrate it with Open WebUI, LiteLLM, Claude Code, Hermes, OpenAI SDK-compatible clients, and other tools.

> **Important:** This is an experimental proxy for the DeepSeek Web interface, not the official DeepSeek API. DeepSeek may change its private Web API without notice. For production-critical workloads, prefer the official DeepSeek API.

## Features

- OpenAI-compatible Chat Completions with JSON and SSE streaming.
- OpenAI Responses API compatibility.
- Anthropic Messages API compatibility.
- Reasoning output and tool-call parsing for supported formats.
- Model aliases and capability metadata.
- Independent agent sessions using x-agent-session, session, or user.
- Optional Supabase persistence for agent session recovery.
- Inline image uploads for supported request formats.
- Multiple DeepSeek auth accounts with sticky assignment and cooldown handling.
- API-key authentication, health checks, and readiness checks.

## Requirements

- Node.js 18+ for the proxy.
- Node.js 22+ for the built-in browser authentication helper.
- A DeepSeek account.
- Chrome or Chromium for browser-based authentication.

## Quick start

Clone the repository and install dependencies:

    git clone https://github.com/klyphic/UltimateAI.git
    cd UltimateAI
    npm install

Run the authentication helper:

    npm run auth

Choose the login option, sign in to DeepSeek in the separate Chrome window, send a short test message, then return to the terminal and press Enter. The helper saves deepseek-auth.json.

Start the proxy:

    npm start

The default address is http://127.0.0.1:9655.

## Configuration

Copy .env.example to .env. Environment variables take precedence over values in .env.

| Variable | Purpose |
|---|---|
| PORT | HTTP port (default: 9655) |
| HOST | Bind address (default: 127.0.0.1) |
| PROXY_API_KEY | Optional bearer token for API access |
| PROXY_API_KEY_FILE | Read the API key from a mounted secret file |
| REQUIRE_PROXY_API_KEY | Refuse startup when no API key is configured |
| DEEPSEEK_AUTH_PATH | Path to one auth JSON file |
| DEEPSEEK_AUTH_DIR | Directory containing multiple auth JSON files |
| DEEPSEEK_MODEL_TYPE | Upstream DeepSeek Web model type |
| DEEPSEEK_IMAGE_UPLOAD | Enable or disable image uploads |
| DEEPSEEK_MAX_PROMPT_CHARS | Maximum prompt size sent upstream |
| DEEPSEEK_MAX_SESSION_CHARS | Maximum accumulated remote-session size |
| DEEPSEEK_ACCOUNT_COOLDOWN_MS | Account cooldown after upstream errors |
| SUPABASE_URL | Supabase project URL for persistent agent sessions |
| SUPABASE_SECRET_KEY | Server-side Supabase secret/service key |

For a public deployment, configure a strong PROXY_API_KEY and set REQUIRE_PROXY_API_KEY=1. Never expose DeepSeek auth files or the Supabase secret key in frontend code, public repositories, or client-side requests.

For non-interactive startup:

    NON_INTERACTIVE=1 npm start

## Authentication

The auth helper supports login, importing an existing auth file, checking status, and removing the local auth file:

    npm run auth
    npm run auth -- --login
    npm run auth -- --import
    npm run auth -- --status
    npm run auth -- --remove

Import an existing auth file or browser cookie export:

    npm run auth:import -- --input ./deepseek-auth.json
    DEEPSEEK_TOKEN="YOUR_DEEPSEEK_TOKEN" npm run auth:import -- --input ./cookies.json

Do not pass tokens as command-line arguments. Use DEEPSEEK_TOKEN to avoid exposing credentials in shell history or process listings.

For VPS deployments, authenticate on a computer with a graphical browser, copy deepseek-auth.json securely to the server, and protect it with restrictive file permissions (0600 on Linux/macOS).

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | / or /health | Process health and status |
| GET | /readyz | Readiness of configured DeepSeek accounts |
| GET | /v1/models | Supported model aliases |
| GET | /v1/model-capabilities | Model alias and capability metadata |
| POST | /v1/chat/completions | OpenAI Chat Completions |
| POST | /v1/responses | OpenAI Responses API |
| POST | /v1/messages | Anthropic Messages API |
| GET | /v1/sessions | Active local agent sessions |
| POST | /reset-session?agent=<id> | Reset one agent's remote chat |
| POST | /reset-session?agent=all | Reset all agent remote chats |

List models:

    curl https://ai.fastdevelopers.in/v1/models \
      -H "Authorization: Bearer YOUR_PROXY_API_KEY"

Send a chat completion:

    curl https://ai.fastdevelopers.in/v1/chat/completions \
      -H "Authorization: Bearer YOUR_PROXY_API_KEY" \
      -H "Content-Type: application/json" \
      -H "x-agent-session: example-agent-001" \
      -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Hello! Reply with OK."}]}'

## Agent sessions and memory

Session identity is selected in this order:

1. x-agent-session request header.
2. session request-body field.
3. user request-body field.
4. Client IP address as a fallback.

For multi-user or multi-agent applications, always provide a unique, stable session identifier. IP fallback is not suitable for user isolation when many users share one backend IP.

The proxy reuses a DeepSeek remote chat for each agent and sends only new message deltas when possible. Local recovery history can be persisted to Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are configured. Resetting a remote session clears upstream chat identifiers but preserves local recovery history, allowing a new upstream chat to continue with saved context.

Reset one agent:

    curl -X POST "https://ai.fastdevelopers.in/reset-session?agent=YOUR_AGENT_ID" \
      -H "Authorization: Bearer YOUR_PROXY_API_KEY"

Reset all agents:

    curl -X POST "https://ai.fastdevelopers.in/reset-session?agent=all" \
      -H "Authorization: Bearer YOUR_PROXY_API_KEY"

## Supabase session persistence

The optional Supabase integration is implemented in lib/session-store.js and connected to the request/session lifecycle in server.js. It stores each agent's remote chat mapping and recovery state in the public.ultimateai_sessions table.

Required server environment variables:

- SUPABASE_URL
- SUPABASE_SECRET_KEY

The Supabase secret key must remain server-side. The table was provisioned in the Supabase project separately from this repository.

## Models

Use GET /v1/models for the live public model list and GET /v1/model-capabilities for capability details. Model aliases may map to the same underlying DeepSeek Web mode, with reasoning and web search controlled by supported request options.

## Images

Inline base64 images are supported for compatible OpenAI and Anthropic request formats when image upload is enabled. Remote image URLs are not fetched by the proxy. Supported formats include PNG, JPEG, WebP, and GIF. Set DEEPSEEK_IMAGE_UPLOAD=0 to disable uploads.

## Deployment

The repository includes a Containerfile and a systemd service example under deploy/.

For public deployments:
- Put the service behind HTTPS.
- Require an API key.
- Keep DeepSeek auth files and Supabase secrets outside the repository.
- Use a persistent database for session recovery. Ephemeral hosting filesystems are not durable.

## Diagnostics and tests

Run diagnostics:

    npm run doctor

Run tests:

    npm test

The live smoke-test script requires a running proxy and a valid configured DeepSeek auth account.

## License and attribution

UltimateAI is maintained by **ForgetMeAI × FAST**. This repository is a modified fork of the MIT-licensed FreeDeepseekAPI project. The original copyright and MIT license notice are retained in LICENSE as required by the license. See NOTICE.md for attribution details.
