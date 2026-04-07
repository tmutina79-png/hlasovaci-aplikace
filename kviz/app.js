// === Kvíz — studentská stránka (jedna otázka najednou) ===
// v3: Cache-busting, agresivní sync, spolehlivý auto-reset

const DEFAULT_BLOB_ID = '019d694b-b3d1-7e71-9af8-0855d892e695';
const BLOB_API_BASE = 'https://jsonblob.com/api/jsonBlob/';
const CORS_PROXY = 'https://cors.eu.org/';
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
setActiveBlobId(ACTIVE_BLOB_ID);

function getBlobRawUrl(blobId = ACTIVE_BLOB_ID) {
    return `${BLOB_API_BASE}${blobId}`;
}

function getBlobProxyUrl(blobId = ACTIVE_BLOB_ID) {
    return `${CORS_PROXY}${getBlobRawUrl(blobId)}`;
}

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

let MY_UUID = getOrCreateUuid();

// ─── Stav ──────────────────────────────────────────────────
let serverData = null;
let currentQIndex = 0;
let hasChangedCurrent = false;

let userVotes = JSON.parse(localStorage.getItem('quiz_userVotes') || '{}');

function saveUserVotes() {
    localStorage.setItem('quiz_userVotes', JSON.stringify(userVotes));
}

// ─── Detekce resetu z dashboardu ───────────────────────────
function getLocalResetTs() {
    return parseInt(localStorage.getItem('quiz_resetTimestamp') || '0');
}

// Vrátí true pokud byl detekován reset → volající MUSÍ udělat reload
function checkForReset() {
    if (!serverData) return false;

    const serverTs = serverData.resetTimestamp || 0;
    const localTs = getLocalResetTs();

    // Metoda 1: resetTimestamp na serveru je novější než náš lokální
    if (serverTs > 0 && serverTs > localTs) {
        doLocalReset(serverTs);
        return true;
    }

    // Metoda 2: server nemá žádné votery, ale my máme lokální hlasy
    if (Object.keys(userVotes).length > 0) {
        const voters = serverData.voters || {};
        if (Object.keys(voters).length === 0) {
            doLocalReset(serverTs);
            return true;
        }
    }

    return false;
}

function doLocalReset(serverTs) {
    console.log('🔄 Reset detekován — mažu lokální data');
    localStorage.removeItem('quiz_userVotes');
    localStorage.removeItem('quiz_uuid');
    if (serverTs > 0) {
        localStorage.setItem('quiz_resetTimestamp', String(serverTs));
    }
    // Po reloadu se vytvoří nový UUID a prázdné userVotes
}

// ─── Server — cache-busting na každém požadavku ────────────
function getFetchUrls() {
    const t = Date.now();
    const raw = getBlobRawUrl(ACTIVE_BLOB_ID);
    const proxy = getBlobProxyUrl(ACTIVE_BLOB_ID);
    return [
        proxy + '?_=' + t,
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

    // Pokud je blob pryč (404), přepni na výchozí blob a obnov stránku.
    // Tím se automaticky opraví starý odkaz/QR.
    if (lastStatus === 404 && ACTIVE_BLOB_ID !== DEFAULT_BLOB_ID) {
        console.warn('jsonblob 404 — přepínám na výchozí session blob…');
        setActiveBlobId(DEFAULT_BLOB_ID);
        window.location.reload();
        return null;
    }

    return null;
}

async function putData(data) {
    const urls = [getBlobProxyUrl(ACTIVE_BLOB_ID), getBlobRawUrl(ACTIVE_BLOB_ID)];
    for (const url of urls) {
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

// ─── Odeslání hlasu ────────────────────────────────────────
// Zapisuje VŠECHNY lokální hlasy najednou (ne jen aktuální),
// takže i dříve ztracené hlasy se obnoví.
async function sendVote(questionId, answer) {
    // Náhodné zpoždění 0–2s — rozloží souběžné zápisy
    await new Promise(r => setTimeout(r, Math.random() * 2000));

    try {
        const fresh = await fetchVotes();
        if (!fresh) return false;

        if (!fresh.voters) fresh.voters = {};
        if (!fresh.voters[MY_UUID]) fresh.voters[MY_UUID] = {};

        // Zapsat VŠECHNY lokální hlasy, ne jen ten aktuální
        for (const qId in userVotes) {
            fresh.voters[MY_UUID][qId] = userVotes[qId];
        }

        const ok = await putData(fresh);
        if (!ok) return false;

        // Krátká verifikace
        await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
        const verify = await fetchVotes();
        if (verify?.voters?.[MY_UUID]?.[questionId] === answer) {
            return true;
        }

        console.warn('Hlas neověřen, backgroundSync to opraví');
        return false;
    } catch (err) {
        console.warn('sendVote chyba:', err.message);
        return false;
    }
}

// ─── Background sync — každé 3s kontrola + dosync ─────────
async function backgroundSync() {
    if (Object.keys(userVotes).length === 0) return;

    try {
        const fresh = await fetchVotes();
        if (!fresh) return;

        const myServer = (fresh.voters && fresh.voters[MY_UUID]) || {};
        let allOk = true;
        for (const qId in userVotes) {
            if (myServer[qId] !== userVotes[qId]) { allOk = false; break; }
        }
        if (allOk) return;

        console.log('↑ Background sync: doplňuji chybějící hlasy…');
        if (!fresh.voters) fresh.voters = {};
        if (!fresh.voters[MY_UUID]) fresh.voters[MY_UUID] = {};
        for (const qId in userVotes) {
            fresh.voters[MY_UUID][qId] = userVotes[qId];
        }
        await putData(fresh);
    } catch (err) {
        console.warn('Sync selhal:', err.message);
    }
}

// ─── Progress ──────────────────────────────────────────────
function updateProgress() {
    const total = QUESTIONS_ORDER.length;
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');
    const answered = QUESTIONS_ORDER.filter(q => userVotes[q]).length;
    if (fill) fill.style.width = (answered / total * 100) + '%';
    if (label) label.textContent = 'Otázka ' + (currentQIndex + 1) + ' / ' + total;
}

// ─── Renderování otázky ────────────────────────────────────
function renderQuestion(qId) {
    const cfg = QUESTIONS[qId];
    const data = serverData?.questions[qId];
    if (!cfg || !data) return;

    hasChangedCurrent = false;
    updateProgress();

    const area = document.getElementById('quiz-area');
    area.style.display = '';
    const hdr = document.querySelector('.quiz-header');
    if (hdr) hdr.style.display = '';

    const isStars = cfg.isStars;
    const existingVote = userVotes[qId];

    let html = '<div class="question-slide">';
    html += '  <div class="quiz-question-tag"><span class="tag tag--' + cfg.tagColor + '">' + cfg.tag + '</span></div>';
    html += '  <h2 class="quiz-title">' + cfg.title + '</h2>';
    html += '  <div class="quiz-options' + (isStars ? ' quiz-options--stars' : '') + '">';

    data.options.forEach(function(option, idx) {
        const icon = cfg.icons[option] || '📌';
        const starClass = isStars ? ' quiz-option--star' : '';
        let stateClass = '';
        if (existingVote) {
            stateClass = (option === existingVote) ? ' selected' : ' locked';
        }
        const safeAnswer = encodeURIComponent(option);
        html += '<button class="quiz-option' + starClass + stateClass + '" data-answer="' + safeAnswer + '" onclick="selectAnswer(\'' + qId + '\', decodeURIComponent(this.dataset.answer))">';
        if (isStars) {
            html += '<span class="quiz-option-icon">' + '⭐'.repeat(idx + 1) + '</span>';
            html += '<span class="quiz-option-label">' + (idx + 1) + '</span>';
        } else {
            html += '<span class="quiz-option-icon">' + icon + '</span>';
            html += '<span class="quiz-option-label">' + option + '</span>';
        }
        html += '</button>';
    });

    html += '</div>';
    html += '<div class="quiz-confirm' + (existingVote ? ' visible' : '') + '" id="confirm-msg">✓ Odpověď odeslána</div>';

    const isLast = currentQIndex >= QUESTIONS_ORDER.length - 1;
    const nextLabel = isLast ? '🎉 Dokončit' : 'Další otázka →';
    html += '<button class="quiz-next' + (existingVote ? ' visible' : '') + '" id="next-btn" onclick="goNext()">' + nextLabel + '</button>';
    html += '</div>';

    area.innerHTML = html;
}

// ─── Hlasování — jeden hlas na otázku, bez možnosti změny ──
async function selectAnswer(qId, answer) {
    // Pokud už je odpověď na tuto otázku, ignoruj
    if (userVotes[qId]) return;

    const buttons = document.querySelectorAll('.quiz-option');
    buttons.forEach(function(btn) {
        const btnAnswer = decodeURIComponent(btn.dataset.answer);
        btn.classList.remove('selected', 'dimmed', 'locked');
        if (btnAnswer === answer) {
            btn.classList.add('selected');
        } else {
            btn.classList.add('locked');
        }
    });

    const confirmEl = document.getElementById('confirm-msg');
    const nextBtn = document.getElementById('next-btn');
    if (confirmEl) {
        confirmEl.textContent = '✓ Odpověď odeslána';
        confirmEl.classList.add('visible');
    }
    if (nextBtn) nextBtn.classList.add('visible');

    // Uložit lokálně HNED
    userVotes[qId] = answer;
    saveUserVotes();
    updateProgress();

    // Server na pozadí
    sendVote(qId, answer).then(function(ok) {
        if (!ok) console.warn('Server sync selhal, backgroundSync to dožene');
    });
}

// ─── Navigace ──────────────────────────────────────────────
function goNext() {
    currentQIndex++;
    if (currentQIndex >= QUESTIONS_ORDER.length) {
        showDone();
        return;
    }
    const slide = document.querySelector('.question-slide');
    if (slide) {
        slide.classList.add('exiting');
        setTimeout(function() { renderQuestion(QUESTIONS_ORDER[currentQIndex]); }, 300);
    } else {
        renderQuestion(QUESTIONS_ORDER[currentQIndex]);
    }
}

// ─── Hotovo ────────────────────────────────────────────────
function showDone() {
    document.getElementById('quiz-area').style.display = 'none';
    var hdr = document.querySelector('.quiz-header');
    if (hdr) hdr.style.display = 'none';

    var progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        var fill = progressBar.querySelector('.progress-fill');
        if (fill) fill.style.width = '100%';
    }

    document.getElementById('done-screen').classList.add('visible');

    // Agresivní sync po dokončení — žák může kdykoliv zavřít telefon
    backgroundSync();
    setTimeout(backgroundSync, 2000);
    setTimeout(backgroundSync, 5000);
    setTimeout(backgroundSync, 10000);
}

// ─── Restart kvízu (po resetu z dashboardu) ────────────────
// Vrátí stránku do výchozího stavu BEZ reloadu stránky.
function restartQuiz() {
    // Nový UUID
    MY_UUID = getOrCreateUuid();
    userVotes = {};
    currentQIndex = 0;
    hasChangedCurrent = false;

    // Schovat done screen, zobrazit quiz
    var doneScreen = document.getElementById('done-screen');
    if (doneScreen) doneScreen.classList.remove('visible');

    var quizArea = document.getElementById('quiz-area');
    if (quizArea) quizArea.style.display = '';

    var hdr = document.querySelector('.quiz-header');
    if (hdr) hdr.style.display = '';

    renderQuestion(QUESTIONS_ORDER[0]);
}

// ─── Inicializace ──────────────────────────────────────────
async function init() {
    await fetchVotes();

    if (!serverData) {
        document.getElementById('quiz-area').innerHTML = '<p class="quiz-loading">Nepodařilo se načíst otázky. Zkus obnovit stránku.</p>';
        return;
    }

    // Pokud byl detekován reset → vyčistit a restartovat
    if (checkForReset()) {
        // localStorage je vyčištěný, ale stránka ještě zobrazuje starý stav.
        // Místo location.reload vytvoříme nový UUID a restartujeme kvíz in-place.
        restartQuiz();
        // Nereturni — pokračuj do setInterval
    } else {
        // Najít první nezodpovězenou otázku
        currentQIndex = QUESTIONS_ORDER.length;
        for (var i = 0; i < QUESTIONS_ORDER.length; i++) {
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
    }

    // Periodická kontrola resetu + sync (každé 3 sekundy)
    setInterval(async function() {
        await fetchVotes();

        if (checkForReset()) {
            // Reset detekován → restartovat kvíz bez nutnosti manuálního refreshe
            restartQuiz();
            return;
        }

        await backgroundSync();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
