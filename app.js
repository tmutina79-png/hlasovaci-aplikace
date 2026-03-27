// === Dashboard — živé výsledky na tabuli ===
// v2: Agreguje hlasy z individuálních voterů (voters objekt)

const DEFAULT_BLOB_ID = '019d2ed5-bf7f-72a5-bea3-18762dfc4189';
const BLOB_API_BASE = 'https://jsonblob.com/api/jsonBlob/';
const CORS_PROXY = 'https://corsproxy.io/?url=';
const BLOB_ID_STORAGE_KEY = 'hlasovani_blob_id';

function getBlobIdFromUrl() {
    try {
        return new URL(window.location.href).searchParams.get('blob');
    } catch {
        return null;
    }
}

function setBlobIdInUrl(blobId) {
    const url = new URL(window.location.href);
    url.searchParams.set('blob', blobId);
    window.history.replaceState(null, '', url);
}

function getActiveBlobId() {
    return getBlobIdFromUrl() || localStorage.getItem(BLOB_ID_STORAGE_KEY) || DEFAULT_BLOB_ID;
}

function setActiveBlobId(blobId) {
    localStorage.setItem(BLOB_ID_STORAGE_KEY, blobId);
    setBlobIdInUrl(blobId);
}

let ACTIVE_BLOB_ID = getActiveBlobId();

function getBlobRawUrl(blobId = ACTIVE_BLOB_ID) {
    return `${BLOB_API_BASE}${blobId}`;
}

function getBlobProxyUrl(blobId = ACTIVE_BLOB_ID) {
    return `${CORS_PROXY}${encodeURIComponent(getBlobRawUrl(blobId))}`;
}

const INITIAL_BLOB_DATA = {
    questions: {
        "1": { question: "Už jsi někdy vytvořil aplikaci?", options: ["Ano", "Zkouším", "Ne", "Jsem profík :-)"] },
        "2": { question: "Víš co je Vibe Coding?", options: ["Ano", "Ne"] },
        "3": { question: "Říká ti něco pojem Informační design?", options: ["Ano", "Ne"] },
        "4": { question: "Setkal jsi se s pojmem VS Code nebo GitHub?", options: ["Jen s VS Code", "Jen s GitHub", "Obojí znám", "Nevím co to je"] },
        "5": { question: "Jak dlouho myslíš, že vytvoříme pěknou designovou web stránku hypoteční kalkulačky?", options: ["Do 3 minut", "Do 5 minut", "Do 10 minut", "Nevěřím, že se to tomu žvatlalovi podaří!"] },
        "6": { question: "Jak se ti líbil workshop?", options: ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"] }
    },
    voters: {},
    resetTimestamp: 0
};

let _recoveringBlob = false;

async function createNewBlob() {
    const res = await fetch('https://jsonblob.com/api/jsonBlob', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(INITIAL_BLOB_DATA)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const headerId = res.headers.get('x-jsonblob-id');
    if (headerId) return headerId;

    const locationHeader = res.headers.get('location');
    if (locationHeader) {
        const m = locationHeader.match(/\/api\/jsonBlob\/(.+)$/);
        if (m && m[1]) return m[1];
    }

    throw new Error('Nepodařilo se zjistit ID nového jsonblobu');
}

function getQuizUrlForBlob(blobId = ACTIVE_BLOB_ID) {
    const base = new URL('.', window.location.href);
    const quizUrl = new URL('kviz/', base);
    quizUrl.searchParams.set('blob', blobId);
    return quizUrl.toString();
}

function updateQrAndQuizLink() {
    const quizUrl = getQuizUrlForBlob(ACTIVE_BLOB_ID);
    const encoded = encodeURIComponent(quizUrl);

    const cardImg = document.querySelector('.qr-img');
    if (cardImg) {
        cardImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
        cardImg.onerror = function () {
            this.onerror = null;
            this.src = `https://quickchart.io/qr?text=${encoded}&size=300`;
        };
    }

    const modalImg = document.querySelector('.qr-modal-qr');
    if (modalImg) {
        modalImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encoded}`;
        modalImg.onerror = function () {
            this.onerror = null;
            this.src = `https://quickchart.io/qr?text=${encoded}&size=800`;
        };
    }

    const urlEl = document.querySelector('.qr-url');
    if (urlEl) urlEl.textContent = quizUrl.replace(/^https?:\/\//, '');

    const modalUrlEl = document.querySelector('.qr-modal-url');
    if (modalUrlEl) modalUrlEl.textContent = quizUrl.replace(/^https?:\/\//, '');

    const quizLinkBtn = document.querySelector('.quiz-link-btn');
    if (quizLinkBtn) quizLinkBtn.href = quizUrl;
}
const POLL_INTERVAL = 2000;

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

// ─── Komunikace se serverem (cache-busting) ───────────────
function getFetchUrls() {
    const t = Date.now();
    const raw = getBlobRawUrl(ACTIVE_BLOB_ID);
    const proxy = getBlobProxyUrl(ACTIVE_BLOB_ID);
    return [
        proxy + '&_=' + t,
        raw + '?_=' + t
    ];
}

async function fetchVotes() {
    let lastStatus = 0;
    for (const url of getFetchUrls()) {
        try {
            const res = await fetch(url, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
            });
            lastStatus = res.status;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            serverData = await res.json();
            if (!serverData.voters) serverData.voters = {};
            return serverData;
        } catch (err) {
            console.warn('Fetch selhal:', err.message);
        }
    }

    if (lastStatus === 404 && !_recoveringBlob) {
        _recoveringBlob = true;
        try {
            console.warn('jsonblob 404 — vytvářím nový blob…');
            const newId = await createNewBlob();
            ACTIVE_BLOB_ID = newId;
            setActiveBlobId(newId);
            updateQrAndQuizLink();
            window.location.reload();
            return null;
        } catch (err) {
            console.error('Nepodařilo se vytvořit nový blob:', err.message);
        } finally {
            _recoveringBlob = false;
        }
    }

    console.error('Všechny pokusy o načtení dat selhaly');
    return null;
}

async function putData(data) {
    const raw = getBlobRawUrl(ACTIVE_BLOB_ID);
    const proxy = getBlobProxyUrl(ACTIVE_BLOB_ID);
    for (const url of [proxy, raw]) {
        try {
            const res = await fetch(url, {
                method: 'PUT',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return true;
        } catch (err) {
            console.warn('PUT selhal:', err.message);
        }
    }
    return false;
}

// ─── Agregace hlasů z voters ───────────────────────────────
// Spočítá hlasy pro každou otázku z individuálních záznamů voterů
function aggregateVotes(qId) {
    const voters = serverData?.voters || {};
    const data = serverData?.questions[qId];
    if (!data) return {};

    // Inicializovat počty na 0
    const counts = {};
    data.options.forEach(opt => counts[opt] = 0);

    // Projít všechny votery
    for (const uuid in voters) {
        const voterAnswer = voters[uuid][qId];
        if (voterAnswer && counts.hasOwnProperty(voterAnswer)) {
            counts[voterAnswer]++;
        }
    }

    return counts;
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

        const counts = aggregateVotes(qId);
        const totalVotes = Object.values(counts).reduce((s, c) => s + c, 0);

        html += `<section class="dash-card" id="dash-${qId}">`;
        html += `  <div class="dash-header">`;
        html += `    <span class="tag tag--${cfg.tagColor}">${cfg.tag}</span>`;
        html += `    <span class="dash-count" id="count-${qId}">${totalVotes} hlasů</span>`;
        html += `  </div>`;
        html += `  <h3 class="dash-title">${cfg.title}</h3>`;
        html += `  <div class="dash-bars">`;

        data.options.forEach((option, idx) => {
            const count = counts[option] || 0;
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

    for (const qId in serverData.questions) {
        const data = serverData.questions[qId];
        const counts = aggregateVotes(qId);
        const totalVotes = Object.values(counts).reduce((s, c) => s + c, 0);

        const countEl = document.getElementById(`count-${qId}`);
        if (countEl) countEl.textContent = `${totalVotes} hlasů`;

        data.options.forEach((option, idx) => {
            const count = counts[option] || 0;
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

            const fill = document.getElementById(`fill-${qId}-${idx}`);
            const val = document.getElementById(`val-${qId}-${idx}`);

            if (fill) {
                const oldPct = parseFloat(fill.style.width) || 0;
                fill.style.width = `${pct}%`;

                if (Math.abs(pct - oldPct) > 0.5) {
                    fill.classList.add('bar-pulse');
                    setTimeout(() => fill.classList.remove('bar-pulse'), 500);
                }
            }
            if (val) val.textContent = `${count} (${Math.round(pct)}%)`;
        });
    }
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

        // Smazat všechny votery (individuální hlasy)
        fresh.voters = {};

        // Timestamp resetu
        fresh.resetTimestamp = Date.now();

        const ok = await putData(fresh);
        if (!ok) throw new Error('Reset save failed');

        location.reload();
    } catch (err) {
        alert('Chyba: ' + err.message);
    }
}

// ─── Inicializace ──────────────────────────────────────────
async function init() {
    updateQrAndQuizLink();
    await fetchVotes();
    buildDashboard();
    updateDashboard();
    setInterval(pollResults, POLL_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);
