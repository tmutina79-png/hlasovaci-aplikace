// === Dashboard — živé výsledky na tabuli ===

const BLOB_ID = '019d1c02-916b-7907-9cfb-01589a2bd5a5';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;
const POLL_INTERVAL = 2000; // 2s pro živý pocit

// ─── Konfigurace otázek (titulky, barvy) ───────────────────
const QUESTIONS = {
    "1": { title: "Už jsi někdy vytvořil aplikaci?",               tag: "Otázka 1", tagColor: "blue",   gradient: "linear-gradient(90deg, #2563eb, #0891b2)" },
    "2": { title: "Víš co je Vibe Coding?",                        tag: "Otázka 2", tagColor: "green",  gradient: "linear-gradient(90deg, #16a34a, #34d399)" },
    "3": { title: "Říká ti něco pojem Informační design?",         tag: "Otázka 3", tagColor: "purple", gradient: "linear-gradient(90deg, #7c3aed, #a78bfa)" },
    "4": { title: "Setkal jsi se s pojmem VS Code nebo GitHub?",   tag: "Otázka 4", tagColor: "cyan",   gradient: "linear-gradient(90deg, #0891b2, #22d3ee)" },
    "5": { title: "Jak dlouho vytvoříme web kalkulačky?",           tag: "Otázka 5", tagColor: "orange", gradient: "linear-gradient(90deg, #ea580c, #fb923c)" },
    "6": { title: "Jak se ti líbil workshop?",                      tag: "Otázka 6", tagColor: "pink",   gradient: "linear-gradient(90deg, #db2777, #f472b6)" }
};

let serverData = null;
let dashboardBuilt = false;

// ─── Komunikace se serverem ────────────────────────────────
async function fetchVotes() {
    try {
        const res = await fetch(BLOB_URL, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Fetch failed');
        serverData = await res.json();
        return serverData;
    } catch (err) {
        console.error('Chyba:', err);
        return null;
    }
}

// ─── Sestavení dashboard karet ─────────────────────────────
function buildDashboard() {
    const container = document.getElementById('dashboard');
    if (!serverData) return;

    let html = '';
    for (const qId in QUESTIONS) {
        const cfg = QUESTIONS[qId];
        const data = serverData.questions[qId];
        if (!data) continue;

        const totalVotes = Object.values(data.votes).reduce((s, c) => s + c, 0);

        html += `<section class="dash-card" id="dash-${qId}">`;
        html += `  <div class="dash-header">`;
        html += `    <span class="tag tag--${cfg.tagColor}">${cfg.tag}</span>`;
        html += `    <span class="dash-count" id="count-${qId}">${totalVotes} hlasů</span>`;
        html += `  </div>`;
        html += `  <h3 class="dash-title">${cfg.title}</h3>`;
        html += `  <div class="dash-bars">`;

        data.options.forEach((option, idx) => {
            const count = data.votes[option];
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

            html += `<div class="bar-row">`;
            html += `  <span class="bar-label">${option}</span>`;
            html += `  <div class="bar-track">`;
            html += `    <div class="bar-fill" id="fill-${qId}-${idx}" style="width:${pct}%;background:${cfg.gradient}"></div>`;
            html += `    <span class="bar-value" id="val-${qId}-${idx}">${count} (${Math.round(pct)}%)</span>`;
            html += `  </div>`;
            html += `</div>`;
        });

        html += `  </div>`;
        html += `</section>`;
    }

    container.innerHTML = html;
    dashboardBuilt = true;
}

// ─── Aktualizace barů (bez rebuildu DOM) ───────────────────
function updateDashboard() {
    if (!serverData || !dashboardBuilt) {
        buildDashboard();
        return;
    }

    let totalRespondents = 0;

    for (const qId in serverData.questions) {
        const data = serverData.questions[qId];
        const totalVotes = Object.values(data.votes).reduce((s, c) => s + c, 0);
        if (qId === "1") totalRespondents = totalVotes;

        // Aktualizovat počet hlasů
        const countEl = document.getElementById(`count-${qId}`);
        if (countEl) countEl.textContent = `${totalVotes} hlasů`;

        // Aktualizovat bary
        data.options.forEach((option, idx) => {
            const count = data.votes[option];
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

            const fill = document.getElementById(`fill-${qId}-${idx}`);
            const val = document.getElementById(`val-${qId}-${idx}`);

            if (fill) {
                const oldPct = parseFloat(fill.style.width) || 0;
                fill.style.width = `${pct}%`;

                // Pulzní animace při změně
                if (Math.abs(pct - oldPct) > 0.5) {
                    fill.classList.add('bar-pulse');
                    setTimeout(() => fill.classList.remove('bar-pulse'), 500);
                }
            }
            if (val) val.textContent = `${count} (${Math.round(pct)}%)`;
        });
    }

    // Aktualizovat počet respondentů
    const el = document.getElementById('respondent-count');
    if (el) el.textContent = totalRespondents;
}

// ─── Polling ───────────────────────────────────────────────
async function pollResults() {
    await fetchVotes();
    updateDashboard();
}

// ─── Reset ─────────────────────────────────────────────────
async function resetAll() {
    if (!confirm('Opravdu chceš resetovat VŠECHNY hlasy?')) return;

    try {
        const fresh = await fetchVotes();
        if (!fresh) return;

        for (const qId in fresh.questions) {
            for (const opt of fresh.questions[qId].options) {
                fresh.questions[qId].votes[opt] = 0;
            }
        }

        await fetch(BLOB_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(fresh)
        });

        location.reload();
    } catch (err) {
        alert('Chyba: ' + err.message);
    }
}

// ─── Inicializace ──────────────────────────────────────────
async function init() {
    await fetchVotes();
    buildDashboard();
    updateDashboard();
    setInterval(pollResults, POLL_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);
