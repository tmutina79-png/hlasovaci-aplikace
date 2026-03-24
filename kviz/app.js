// === Kvíz — studentská stránka (jedna otázka najednou) ===
// v2: Každý žák zapisuje pod svým UUID → žádné přepisování cizích hlasů

const BLOB_ID = '019d1c02-916b-7907-9cfb-01589a2bd5a5';
const BLOB_RAW = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;
const BLOB_URL = `https://corsproxy.io/?url=${BLOB_RAW}`;

// ─── Pořadí a konfigurace otázek ───────────────────────────
const QUESTIONS_ORDER = ["1", "2", "3", "4", "5", "6"];

const QUESTIONS = {
    "1": {
        title: "Už jsi někdy vytvořil aplikaci?",
        tag: "Otázka 1", tagColor: "blue",
        icons: { "Ano": "✅", "Zkouším": "🔧", "Ne": "❌", "Jsem profík :-)": "🏆" }
    },
    "2": {
        title: "Víš co je Vibe Coding?",
        tag: "Otázka 2", tagColor: "green",
        icons: { "Ano": "👍", "Ne": "👎" }
    },
    "3": {
        title: "Říká ti něco pojem Informační design?",
        tag: "Otázka 3", tagColor: "purple",
        icons: { "Ano": "👍", "Ne": "👎" }
    },
    "4": {
        title: "Setkal jsi se někdy s pojmem VS Code nebo GitHub?",
        tag: "Otázka 4", tagColor: "cyan",
        icons: { "Jen s VS Code": "💻", "Jen s GitHub": "🐙", "Obojí znám": "🤓", "Nevím co to je": "🤷" }
    },
    "5": {
        title: "Jak dlouho myslíš, že vytvoříme pěknou designovou web stránku hypoteční kalkulačky?",
        tag: "Otázka 5", tagColor: "orange",
        icons: { "Do 3 minut": "⚡", "Do 5 minut": "🕐", "Do 10 minut": "🕙", "Nevěřím, že se to tomu žvatlalovi podaří!": "😤" }
    },
    "6": {
        title: "Jak se ti líbil workshop?",
        tag: "Otázka 6", tagColor: "pink",
        isStars: true,
        icons: { "⭐": "⭐", "⭐⭐": "⭐⭐", "⭐⭐⭐": "⭐⭐⭐", "⭐⭐⭐⭐": "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐": "⭐⭐⭐⭐⭐" }
    }
};

// ─── UUID — unikátní identifikátor žáka ────────────────────
function getOrCreateUuid() {
    let uuid = localStorage.getItem('quiz_uuid');
    if (!uuid) {
        uuid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('quiz_uuid', uuid);
    }
    return uuid;
}

const MY_UUID = getOrCreateUuid();

// ─── Stav ──────────────────────────────────────────────────
let serverData = null;
let currentQIndex = 0;
let hasChangedCurrent = false;

// Lokální hlasy: { "1": "Ano", "2": "Ne", ... }
let userVotes = JSON.parse(localStorage.getItem('quiz_userVotes') || '{}');

function saveUserVotes() {
    localStorage.setItem('quiz_userVotes', JSON.stringify(userVotes));
}

// ─── Detekce resetu z dashboardu ───────────────────────────
function getLocalResetTs() {
    return parseInt(localStorage.getItem('quiz_resetTimestamp') || '0');
}

function checkForReset() {
    if (!serverData) return false;
    let resetDetected = false;

    // Metoda 1: resetTimestamp se změnil
    if (serverData.resetTimestamp) {
        const serverTs = serverData.resetTimestamp;
        const localTs = getLocalResetTs();
        if (serverTs > localTs) {
            resetDetected = true;
        }
    }

    // Metoda 2: server nemá žádné votery, ale uživatel má lokální hlasy
    if (!resetDetected && Object.keys(userVotes).length > 0) {
        const voters = serverData.voters || {};
        if (Object.keys(voters).length === 0) {
            resetDetected = true;
        }
    }

    if (resetDetected) {
        localStorage.removeItem('quiz_userVotes');
        localStorage.removeItem('quiz_uuid');
        userVotes = {};
        currentQIndex = 0;
        hasChangedCurrent = false;
        if (serverData.resetTimestamp) {
            localStorage.setItem('quiz_resetTimestamp', String(serverData.resetTimestamp));
        }
    }

    return resetDetected;
}

// ─── Server ────────────────────────────────────────────────
const FETCH_URLS = [BLOB_URL, BLOB_RAW];

async function fetchFrom(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { 'Accept': 'application/json', ...options.headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
}

async function fetchVotes() {
    for (const url of FETCH_URLS) {
        try {
            const res = await fetchFrom(url);
            serverData = await res.json();
            if (!serverData.voters) serverData.voters = {};
            return serverData;
        } catch (err) {
            console.warn(`Fetch z ${url.slice(0, 40)}… selhal:`, err.message);
        }
    }
    console.error('Všechny pokusy o načtení dat selhaly');
    return null;
}

async function putData(data) {
    for (const url of FETCH_URLS) {
        try {
            await fetchFrom(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return true;
        } catch (err) {
            console.warn(`PUT na ${url.slice(0, 40)}… selhal:`, err.message);
        }
    }
    return false;
}

// ─── Odeslání hlasu — retry loop s verifikací ──────────────
// Každý žák píše pod svým UUID → i když dva zapíšou naráz,
// pozdější zápis přečte data VČETNĚ předchozího UUID a nic nepřepíše.
async function sendVote(questionId, answer) {
    const MAX_RETRIES = 6;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const delay = attempt === 0
            ? Math.floor(Math.random() * 800)
            : 300 * attempt + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));

        try {
            const fresh = await fetchVotes();
            if (!fresh) continue;

            if (!fresh.voters) fresh.voters = {};
            if (!fresh.voters[MY_UUID]) fresh.voters[MY_UUID] = {};
            fresh.voters[MY_UUID][questionId] = answer;

            const ok = await putData(fresh);
            if (!ok) continue;

            // Verifikovat
            await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
            const verify = await fetchVotes();
            if (verify && verify.voters && verify.voters[MY_UUID] &&
                verify.voters[MY_UUID][questionId] === answer) {
                serverData = verify;
                return true;
            }

            console.warn(`Hlas ztracen (pokus ${attempt + 1}), zkouším znovu…`);
        } catch (err) {
            console.warn(`Chyba (pokus ${attempt + 1}):`, err.message);
        }
    }

    console.error('Nepodařilo se odeslat hlas po', MAX_RETRIES, 'pokusech');
    return false;
}

// ─── Pozadí: synchronizace neodeslaných hlasů ──────────────
async function backgroundSync() {
    if (Object.keys(userVotes).length === 0) return;

    try {
        const fresh = await fetchVotes();
        if (!fresh) return;

        const myServerVotes = (fresh.voters && fresh.voters[MY_UUID]) || {};
        let needsSync = false;

        for (const qId in userVotes) {
            if (myServerVotes[qId] !== userVotes[qId]) {
                needsSync = true;
                break;
            }
        }

        if (needsSync) {
            console.log('Background sync: doplňuji chybějící hlasy…');
            if (!fresh.voters) fresh.voters = {};
            fresh.voters[MY_UUID] = { ...userVotes };
            await putData(fresh);
        }
    } catch (err) {
        console.warn('Background sync selhal:', err.message);
    }
}

// ─── Progress ──────────────────────────────────────────────
function updateProgress() {
    const total = QUESTIONS_ORDER.length;
    const answered = QUESTIONS_ORDER.filter(q => userVotes[q]).length;
    const pct = (answered / total) * 100;

    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');

    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `Otázka ${currentQIndex + 1} / ${total}`;
}

// ─── Renderování otázky ────────────────────────────────────
function renderQuestion(qId) {
    const cfg = QUESTIONS[qId];
    const data = serverData?.questions[qId];
    if (!cfg || !data) return;

    hasChangedCurrent = false;
    updateProgress();

    const area = document.getElementById('quiz-area');
    const isStars = cfg.isStars;
    const existingVote = userVotes[qId];

    let html = `<div class="question-slide">`;
    html += `  <div class="quiz-question-tag"><span class="tag tag--${cfg.tagColor}">${cfg.tag}</span></div>`;
    html += `  <h2 class="quiz-title">${cfg.title}</h2>`;
    html += `  <div class="quiz-options${isStars ? ' quiz-options--stars' : ''}">`;

    data.options.forEach((option, idx) => {
        const icon = cfg.icons[option] || '📌';
        const starClass = isStars ? ' quiz-option--star' : '';

        let stateClass = '';
        if (existingVote) {
            if (option === existingVote) stateClass = ' selected';
            else stateClass = ' locked';
        }

        const safeAnswer = encodeURIComponent(option);

        html += `<button class="quiz-option${starClass}${stateClass}" data-answer="${safeAnswer}" onclick="selectAnswer('${qId}', decodeURIComponent(this.dataset.answer))">`;

        if (isStars) {
            const starCount = idx + 1;
            html += `  <span class="quiz-option-icon">${'⭐'.repeat(starCount)}</span>`;
            html += `  <span class="quiz-option-label">${starCount}</span>`;
        } else {
            html += `  <span class="quiz-option-icon">${icon}</span>`;
            html += `  <span class="quiz-option-label">${option}</span>`;
        }

        html += `</button>`;
    });

    html += `</div>`;
    html += `<div class="quiz-confirm${existingVote ? ' visible' : ''}" id="confirm-msg">✓ Odpověď odeslána</div>`;

    const isLast = currentQIndex >= QUESTIONS_ORDER.length - 1;
    const nextLabel = isLast ? '🎉 Dokončit' : 'Další otázka →';
    html += `<button class="quiz-next${existingVote ? ' visible' : ''}" id="next-btn" onclick="goNext()">${nextLabel}</button>`;

    html += `</div>`;
    area.innerHTML = html;
}

// ─── Hlasování — optimistický zápis ────────────────────────
async function selectAnswer(qId, answer) {
    const existing = userVotes[qId];

    if (existing && hasChangedCurrent) return;
    if (existing === answer) return;

    const isChange = !!existing;

    // Okamžitý vizuální feedback
    const buttons = document.querySelectorAll('.quiz-option');
    buttons.forEach(btn => {
        const btnAnswer = decodeURIComponent(btn.dataset.answer);
        btn.classList.remove('selected', 'dimmed', 'locked', 'can-change');

        if (btnAnswer === answer) {
            btn.classList.add('selected');
            if (!isChange) btn.classList.add('can-change');
        } else {
            btn.classList.add(isChange ? 'locked' : 'dimmed');
        }
    });

    const confirmEl = document.getElementById('confirm-msg');
    const nextBtn = document.getElementById('next-btn');
    if (confirmEl) {
        confirmEl.textContent = isChange ? '✓ Odpověď změněna' : '✓ Odpověď odeslána';
        confirmEl.classList.add('visible');
    }
    if (nextBtn) nextBtn.classList.add('visible');

    // Optimisticky uložit do localStorage HNED (uživatel nečeká na server)
    userVotes[qId] = answer;
    saveUserVotes();
    if (isChange) hasChangedCurrent = true;
    updateProgress();

    // Server sync na pozadí — neblokuje UI
    sendVote(qId, answer).then(success => {
        if (!success) {
            console.warn('Server sync selhal, backgroundSync to dožene');
        }
    });
}

// ─── Další otázka ──────────────────────────────────────────
function goNext() {
    currentQIndex++;

    if (currentQIndex >= QUESTIONS_ORDER.length) {
        showDone();
        return;
    }

    const slide = document.querySelector('.question-slide');
    if (slide) {
        slide.classList.add('exiting');
        setTimeout(() => {
            renderQuestion(QUESTIONS_ORDER[currentQIndex]);
        }, 300);
    } else {
        renderQuestion(QUESTIONS_ORDER[currentQIndex]);
    }
}

// ─── Hotovo ────────────────────────────────────────────────
function showDone() {
    document.getElementById('quiz-area').style.display = 'none';
    document.querySelector('.quiz-header').style.display = 'none';

    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        const fill = progressBar.querySelector('.progress-fill');
        if (fill) fill.style.width = '100%';
    }

    document.getElementById('done-screen').classList.add('visible');
}

// ─── Inicializace ──────────────────────────────────────────
async function init() {
    await fetchVotes();

    if (!serverData) {
        document.getElementById('quiz-area').innerHTML = '<p class="quiz-loading">Nepodařilo se načíst otázky. Zkus obnovit stránku.</p>';
        return;
    }

    checkForReset();

    currentQIndex = QUESTIONS_ORDER.length;
    for (let i = 0; i < QUESTIONS_ORDER.length; i++) {
        if (!userVotes[QUESTIONS_ORDER[i]]) {
            currentQIndex = i;
            break;
        }
    }

    if (currentQIndex >= QUESTIONS_ORDER.length) {
        showDone();
    } else {
        renderQuestion(QUESTIONS_ORDER[currentQIndex]);
    }

    // Periodicky: kontrola resetu + background sync
    setInterval(async () => {
        await fetchVotes();
        if (checkForReset()) {
            location.reload();
            return;
        }
        await backgroundSync();
    }, 8000);
}

document.addEventListener('DOMContentLoaded', init);
