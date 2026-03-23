// === Kvíz — studentská stránka (jedna otázka najednou) ===

const BLOB_ID = '019d1c02-916b-7907-9cfb-01589a2bd5a5';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

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
        icons: { "Do 3 minut": "⚡", "Do 5 minut": "🕐", "Do 10 minut": "🕙", "Nevěřím, že v této hodině vytvoříte!": "😤" }
    },
    "6": {
        title: "Jak se ti líbil workshop?",
        tag: "Otázka 6", tagColor: "pink",
        isStars: true,
        icons: { "⭐": "⭐", "⭐⭐": "⭐⭐", "⭐⭐⭐": "⭐⭐⭐", "⭐⭐⭐⭐": "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐": "⭐⭐⭐⭐⭐" }
    }
};

// ─── Stav ──────────────────────────────────────────────────
let serverData = null;
let isSaving = false;
let currentQIndex = 0;
let hasChangedCurrent = false; // použil jednu změnu na aktuální otázce?

// localStorage: { "1": "Ano", "2": "Ne", ... }
const userVotes = JSON.parse(localStorage.getItem('quiz_userVotes') || '{}');

function saveUserVotes() {
    localStorage.setItem('quiz_userVotes', JSON.stringify(userVotes));
}

// ─── Server ────────────────────────────────────────────────
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

async function sendVote(questionId, answer, oldAnswer) {
    if (isSaving) return false;
    isSaving = true;
    try {
        const fresh = await fetchVotes();
        if (!fresh) throw new Error('Cannot read data');

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
        console.error('Chyba:', err);
        return false;
    } finally {
        isSaving = false;
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

        // Stav tlačítka pro obnovenou stránku
        let stateClass = '';
        if (existingVote) {
            if (option === existingVote) stateClass = ' selected';
            else stateClass = ' locked';
        }

        // Bezpečné předání názvu odpovědi (emoji, speciální znaky)
        const safeAnswer = encodeURIComponent(option);

        html += `<button class="quiz-option${starClass}${stateClass}" data-answer="${safeAnswer}" onclick="selectAnswer('${qId}', decodeURIComponent(this.dataset.answer))">`;
        html += `  <span class="quiz-option-icon">${icon}</span>`;

        if (!isStars) {
            html += `  <span class="quiz-option-label">${option}</span>`;
        } else {
            html += `  <span class="quiz-option-label">${idx + 1}</span>`;
        }

        html += `</button>`;
    });

    html += `</div>`; // .quiz-options

    // Potvrzení
    html += `<div class="quiz-confirm${existingVote ? ' visible' : ''}" id="confirm-msg">✓ Odpověď odeslána</div>`;

    // Tlačítko další
    const isLast = currentQIndex >= QUESTIONS_ORDER.length - 1;
    const nextLabel = isLast ? '🎉 Dokončit' : 'Další otázka →';
    html += `<button class="quiz-next${existingVote ? ' visible' : ''}" id="next-btn" onclick="goNext()">${nextLabel}</button>`;

    html += `</div>`; // .question-slide

    area.innerHTML = html;
}

// ─── Hlasování ─────────────────────────────────────────────
async function selectAnswer(qId, answer) {
    const existing = userVotes[qId];

    // Už změnil a zamčeno → nic
    if (existing && hasChangedCurrent) return;

    // Stejná odpověď → nic
    if (existing === answer) return;

    const isChange = !!existing;
    const oldAnswer = isChange ? existing : null;

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

    // Zobrazit potvrzení + tlačítko další
    const confirmEl = document.getElementById('confirm-msg');
    const nextBtn = document.getElementById('next-btn');
    if (confirmEl) {
        confirmEl.textContent = isChange ? '✓ Odpověď změněna' : '✓ Odpověď odeslána';
        confirmEl.classList.add('visible');
    }
    if (nextBtn) nextBtn.classList.add('visible');

    // Odeslat na server
    const success = await sendVote(qId, answer, oldAnswer);

    if (success) {
        userVotes[qId] = answer;
        saveUserVotes();
        if (isChange) hasChangedCurrent = true;
        updateProgress();
    } else {
        // Rollback
        if (existing) {
            renderQuestion(qId);
        } else {
            buttons.forEach(btn => btn.classList.remove('selected', 'dimmed', 'locked', 'can-change'));
            if (confirmEl) confirmEl.classList.remove('visible');
            if (nextBtn) nextBtn.classList.remove('visible');
        }
        alert('Chyba při odesílání. Zkus to znovu.');
    }
}

// ─── Další otázka ──────────────────────────────────────────
function goNext() {
    currentQIndex++;

    if (currentQIndex >= QUESTIONS_ORDER.length) {
        showDone();
        return;
    }

    // Animace odchodu
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

    // Najdi první nezodpovězenou otázku
    currentQIndex = QUESTIONS_ORDER.length; // default: všechny zodpovězené
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
}

document.addEventListener('DOMContentLoaded', init);
