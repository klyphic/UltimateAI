const TABLE = 'ultimateai_sessions';

function normalizeParentMessageId(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim();
    if (!/^[0-9]+$/.test(raw)) {
        throw new Error('Invalid DeepSeek parent_message_id: expected an unsigned 32-bit integer');
    }
    const normalized = Number(raw);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0xffffffff) {
        throw new Error('Invalid DeepSeek parent_message_id: expected an unsigned 32-bit integer');
    }
    return normalized;
}

function createSessionStore(env = process.env) {
    const baseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    const secret = String(env.SUPABASE_SECRET_KEY || '').trim();
    const enabled = Boolean(baseUrl && secret);

    async function request(query, options = {}) {
        if (!enabled) return null;
        const response = await fetch(baseUrl + '/rest/v1/' + TABLE + query, {
            ...options,
            headers: {
                apikey: secret,
                Authorization: 'Bearer ' + secret,
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            signal: AbortSignal.timeout(10000),
        });
        const body = await response.text();
        if (!response.ok) throw new Error('Supabase session store HTTP ' + response.status + ': ' + body.slice(0, 400));
        return body ? JSON.parse(body) : null;
    }

    function toRow(agentId, session) {
        return {
            agent_id: agentId,
            deepseek_chat_id: session.id || null,
            account_id: session.accountId || null,
            parent_message_id: normalizeParentMessageId(session.parentMessageId),
            message_count: Number(session.messageCount || 0),
            history: Array.isArray(session.history) ? session.history : [],
            sent_message_keys: Array.isArray(session.sentMessageKeys) ? session.sentMessageKeys : [],
            context_key: session.contextKey || null,
            remote_chars: Number(session.remoteChars || 0),
            created_at: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
            last_activity_at: new Date(session.lastActivityAt || Date.now()).toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    async function save(agentId, session) {
        if (!enabled || !agentId || !session) return false;
        await request('?on_conflict=agent_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(toRow(agentId, session)),
        });
        return true;
    }

    async function load(agentId) {
        if (!enabled) return null;
        const rows = await request('?agent_id=eq.' + encodeURIComponent(agentId) + '&select=*&limit=1');
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return null;
        return {
            agentId: agentId,
            id: row.deepseek_chat_id || null,
            accountId: row.account_id || null,
            parentMessageId: row.parent_message_id == null || row.parent_message_id === ''
                ? null
                : normalizeParentMessageId(row.parent_message_id),
            messageCount: Number(row.message_count || 0),
            history: Array.isArray(row.history) ? row.history : [],
            sentMessageKeys: Array.isArray(row.sent_message_keys) ? row.sent_message_keys : [],
            contextKey: row.context_key || null,
            remoteChars: Number(row.remote_chars || 0),
            createdAt: row.created_at ? Date.parse(row.created_at) : null,
            lastActivityAt: row.last_activity_at ? Date.parse(row.last_activity_at) : Date.now(),
            busy: false,
        };
    }

    async function remove(agentId) {
        if (!enabled || !agentId) return false;
        await request('?agent_id=eq.' + encodeURIComponent(agentId), { method: 'DELETE' });
        return true;
    }

    async function clear() {
        if (!enabled) return false;
        await request('?agent_id=not.is.null', { method: 'DELETE' });
        return true;
    }

    return { enabled, save, load, remove, clear };
}

module.exports = { createSessionStore, normalizeParentMessageId };
