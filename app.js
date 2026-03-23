// === Hlasovací aplikace — 6 otázek, sdílené hlasování přes jsonblob.com ===

// ─── Konfigurace ───────────────────────────────────────────
const BLOB_ID = '019d1c02-916b-7907-9cfb-01589a2bd5a5';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;
const POLL_INTERVAL = 3000;

// ─── Stav aplikace ─────────────────────────────────────────
let serverData = null;
let isSaving = false;

// userVotes: { "1": { answer: "Ano", changed: false }, ... }
const userVotes = JSON.parse(localStorage.getItem('votingApp_userVotes') || '{}');

function saveUserVotes() {
    localStorage.setItem('votingApp_userVotes', JSON.stringify(userVotes));
}

// ─── Komunikace se serverem ────────────────────────────────
async function fetchVotes() {
    try {
        const res = await fetch(BLOB_URL, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Fetch failed');
        serverData = await res.json();
        return serverData;
    } catch (err) {
        console.error('Chyba při načítání hlasů:', err);
        return null;
    }
}

/**
 * Atomic read-modify-write: přičte +1 k answer, případně -1 od oldAnswer
 */
async function saveVote(questionId, answer, oldAnswer) {
    if (isSaving) return false;
    isSaving = true;
    try {
        const fresh = await fetchVotes();
        if (!fresh) throw new Error('Cannot read current data');

        const q = fresh.questions[questionId];
        if (oldAnswer && q.votes[oldAnswer] > 0) {
            q.votes[oldAnswer]--;
        }
        q.votes[answer]++;

        const res = await fetch(BLOB_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(fresh)
        });
        if (!res.ok) throw new Error('Save failed');

        serverData = fresh;
        return true;
    } catch (err) {
        console.error('Chyba při ukládání hlasu:', err);
        return false;
    } finally {
        isSaving = false;
    }
}

// ─── Hlasování ─────────────────────────────────────────────
async function vote(questionId, answer) {
    const qKey = String(questionId);
    const existing = userVotes[qKey];

    // Pokud už hlasoval a už jednou změnil → nic
    if (existing && existing.changed) return;

    // Pokud hlasuje znovu stejně → nic
    if (existing && existing.answer === answer) return;

    const isChange = !!existing;
    const oldAnswer = isChange ? existing.answer : null;

    // Okamžitý vizuální feedback
    applyButtonStates(qKey, answer, isChange);

    const success = await saveVote(qKey, answer, oldAnswer);

    if (success) {
        userVotes[qKey] = {
            answer: answer,
            changed: isChange ? true : false
        };
        saveUserVotes();
        renderResults(qKey);
        applyButtonStates(qKey, answer, false);
    } else {
        // Rollback
        if (existing) {
            applyButtonStates(qKey, existing.answer, !existing.changed);
        } else {
            clearButtonStates(qKey);
        }
        alert('Chyba při odesílání hlasu. Zkus to znovu.');
    }
}

// ─── UI: tlačítka ──────────────────────────────────────────
function applyButtonStates(questionId, votedAnswer, canChange) {
    const container = document.getElementById(`options-${questionId}`);
    if (!container) return;

    const buttons = container.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        const label = btn.querySelector('.option-label').textContent;

        // Resetuj třídy
        btn.classList.remove('voted', 'not-selected', 'can-change', 'can-change-others', 'vote-animation');

        if (label === votedAnswer) {
            btn.classList.add('voted');
            if (canChange) btn.classList.add('can-change');
        } else {
            if (canChange) {
                btn.classList.add('can-change-others');
            } else {
                btn.classList.add('not-selected');
            }
        }
    });

    // Zobrazit výsledky
    const resultsEl = document.getElementById(`results-${questionId}`);
    if (resultsEl) resultsEl.classList.add('visible');
}

function clearButtonStates(questionId) {
    const container = document.getElementById(`options-${questionId}`);
    if (!container) return;
    container.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.remove('voted', 'not-selected', 'can-change', 'can-change-others', 'vote-animation');
    });
    const resultsEl = document.getElementById(`results-${questionId}`);
    if (resultsEl) resultsEl.classList.remove('visible');
}

// ─── UI: inline výsledky ───────────────────────────────────
function renderResults(questionId) {
    if (!serverData || !serverData.questions[questionId]) return;

    const data = serverData.questions[questionId];
    const resultsEl = document.getElementById(`results-${questionId}`);
    if (!resultsEl) return;

    const totalVotes = Object.values(data.votes).reduce((s, c) => s + c, 0);

    let html = '';
    data.options.forEach(option => {
        const count = data.votes[option];
        const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

        html += `
            <div class="result-row">
                <span class="result-row-label">${option}</span>
                <div class="result-row-bar">
                    <div class="result-row-fill" style="width: ${pct}%"></div>
                    <span class="result-row-count">${count} (${Math.round(pct)}%)</span>
                </div>
            </div>
        `;
    });

    html += `<div class="result-row-total">Celkem: ${totalVotes} hlasů</div>`;
    resultsEl.innerHTML = html;

    // Pokud uživatel hlasoval, zobraz
    if (userVotes[questionId]) {
        resultsEl.classList.add('visible');
    }
}

function renderAllResults() {
    if (!serverData) return;
    for (const qId in serverData.questions) {
        renderResults(qId);
    }
}

// ─── Obnova stavu po refreshi ──────────────────────────────
function restoreUserVotes() {
    for (const qId in userVotes) {
        const { answer, changed } = userVotes[qId];
        applyButtonStates(qId, answer, !changed);
    }
}

// ─── Polling ───────────────────────────────────────────────
async function pollResults() {
    await fetchVotes();
    renderAllResults();
}

// ─── Reset ─────────────────────────────────────────────────
async function resetAll() {
    if (!confirm('Opravdu chceš resetovat VŠECHNY hlasy? Toto smaže hlasy všech uživatelů.')) return;

    try {
        const freshData = await fetchVotes();
        if (!freshData) return;

        for (const qId in freshData.questions) {
            const q = freshData.questions[qId];
            for (const opt of q.options) {
                q.votes[opt] = 0;
            }
        }

        await fetch(BLOB_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(freshData)
        });

        localStorage.removeItem('votingApp_userVotes');
        location.reload();
    } catch (err) {
        alert('Chyba při resetování: ' + err.message);
    }
}

// ─── Inicializace ──────────────────────────────────────────
async function init() {
    await fetchVotes();
    renderAllResults();
    restoreUserVotes();
    setInterval(pollResults, POLL_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);
