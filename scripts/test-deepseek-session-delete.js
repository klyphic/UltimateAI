#!/usr/bin/env node
/**
 * Verify DeepSeek Web chat-session deletion using the first configured account.
 *
 * Run: node scripts/test-deepseek-session-delete.js
 *
 * Uses the same auth JSON shape as server.js. Creates one empty temporary chat,
 * asks DeepSeek to delete it, and never prints tokens, cookies, or full session IDs.
 */
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = String(process.env.DEEPSEEK_BASE_URL || 'https://chat.deepseek.com').replace(/\/+$/, '');
const authPath = String(process.env.DEEPSEEK_AUTH_PATH || path.join(process.cwd(), 'deepseek-auth.json'))
    .split(',')[0].trim();

function safeMessage(json) {
    const data = json?.data || {};
    const biz = data.biz_data || {};
    const value = data.biz_msg || data.biz_message || data.message || data.msg
        || biz.biz_msg || biz.biz_message || biz.message || biz.msg || biz.error_msg;
    return typeof value === 'string' ? value.slice(0, 180) : '';
}

async function requestJson(route, headers, body) {
    const response = await fetch(baseUrl + route, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
    const raw = await response.text();
    let json;
    try { json = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`${route}: non-JSON response (HTTP ${response.status})`); }
    return { response, json };
}

async function main() {
    if (!fs.existsSync(authPath)) {
        throw new Error(`Auth file not found: ${authPath}. Set DEEPSEEK_AUTH_PATH to the configured auth JSON.`);
    }
    const config = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    if (!config.token || !config.cookie) {
        throw new Error('Auth JSON must contain token and cookie fields.');
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'x-client-platform': 'web',
        'x-client-version': process.env.DEEPSEEK_CLIENT_VERSION || '2.0.0',
        'x-client-locale': 'ru',
        'x-client-timezone-offset': '14400',
        'x-app-version': process.env.DEEPSEEK_CLIENT_VERSION || '2.0.0',
        'Authorization': `Bearer ${config.token}`,
        'x-hif-dliq': config.hif_dliq || '',
        'x-hif-leim': config.hif_leim || '',
        'Origin': 'https://chat.deepseek.com',
        'Referer': 'https://chat.deepseek.com/',
        'Cookie': config.cookie,
        'Content-Type': 'application/json',
    };

    console.log('[1/2] Creating a temporary DeepSeek chat...');
    const created = await requestJson('/api/v0/chat_session/create', headers, {});
    const sessionId = created.json?.data?.biz_data?.chat_session?.id || created.json?.data?.biz_data?.id;
    if (!created.response.ok || !sessionId) {
        throw new Error(`Create failed: HTTP ${created.response.status}; ${safeMessage(created.json) || 'session ID missing'}`);
    }
    console.log(`Created temporary chat (...${String(sessionId).slice(-6)}).`);

    console.log('[2/2] Requesting deletion...');
    const deleted = await requestJson('/api/v0/chat_session/delete', headers, {
        chat_session_id: sessionId,
    });
    const bizCode = deleted.json?.data?.biz_code;
    const businessOk = bizCode === undefined || bizCode === 0;
    if (!deleted.response.ok || !businessOk) {
        console.error(`DELETE RESULT: FAILED (HTTP ${deleted.response.status}${bizCode === undefined ? '' : `, biz_code ${bizCode}`})`);
        if (safeMessage(deleted.json)) console.error(`DeepSeek message: ${safeMessage(deleted.json)}`);
        console.error('Temporary session may still exist; check it in DeepSeek before retrying.');
        process.exitCode = 1;
        return;
    }

    console.log(`DELETE RESULT: HTTP ${deleted.response.status}, biz_code ${bizCode ?? 'not provided'}.`);
    console.log('DeepSeek accepted the deletion request. This confirms the endpoint contract, not provider-side retention beyond deletion.');
}

main().catch(error => {
    console.error(`TEST FAILED: ${error.message}`);
    process.exitCode = 1;
});
