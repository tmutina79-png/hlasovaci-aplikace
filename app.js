// === Hlasovací aplikace — sdílená databáze přes jsonblob.com ===

// ID sdíleného blobu (všechna zařízení čtou/píší sem)
const BLOB_ID = '019d1c02-916b-7907-9cfb-01589a2bd5a5';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

// Jak často se obnovují výsledky (v ms) — každé 3 sekundy
const POLL_INTERVAL = 3000;

// Lokální definice otázek (pro HTML strukturu)
const questionsConfig = {
    1: {
        options: ["Ano", "Zkouším", "Ne", "Jsem profík :-)"]
    }
};

// Aktuální data hlasů (načtená ze serveru)
let serverData = null;

// Sledování, zda uživatel už hlasoval (v localStorage)
const userVotes = JSON.parse(localStorage.getItem('votingApp_userVotes') || '{}');

// Zámek proti souběžným zápisům
let isSaving = false;

/**
 * Načtení hlasů ze serveru
 */
async function fetchVotes() {
    try {
        const response = await fetch(BLOB_URL, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Fetch failed');
        serverData = await response.json();
        return serverData;
    } catch (err) {
        console.error('Chyba při načítání hlasů:', err);
        return null;
    }
}

/**
 * Uložení hlasů na server (atomic read-modify-write)
 */
async function saveVotesToServer(questionId, answer) {
    if (isSaving) return false;
    isSaving = true;

    try {
        // 1. Načti aktuální stav ze serveru
        const freshData = await fetchVotes();
        if (!freshData) throw new Error('Cannot read current data');

        // 2. Přičti hlas
        freshData.questions[questionId].votes[answer]++;

        // 3. Zapiš zpět
        const response = await fetch(BLOB_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(freshData)
        });

        if (!response.ok) throw new Error('Save failed');

        serverData = freshData;
        return true;
    } catch (err) {
        console.error('Chyba při ukládání hlasu:', err);
        return false;
    } finally {
        isSaving = false;
    }
}

/**
 * Zpracování hlasu
 */
async function vote(questionId, answer) {
    // Kontrola, zda už uživatel hlasoval v této otázce
    if (userVotes[questionId]) return;

    // Zablokuj tlačítka okamžitě (UX feedback)
    const optionsContainer = document.getElementById(`options-${questionId}`);
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        const label = btn.querySelector('.card__title').textContent;
        if (label === answer) {
            btn.classList.add('voted', 'vote-animation');
        } else {
            btn.classList.add('disabled');
        }
    });

    // Uložit na server
    const success = await saveVotesToServer(questionId, answer);

    if (success) {
        // Zaznamenat lokálně, že uživatel hlasoval
        userVotes[questionId] = answer;
        localStorage.setItem('votingApp_userVotes', JSON.stringify(userVotes));
        // Aktualizovat výsledky
        updateAllResults();
    } else {
        // Rollback UI při chybě
        buttons.forEach(btn => {
            btn.classList.remove('voted', 'vote-animation', 'disabled');
        });
        alert('Chyba při odesílání hlasu. Zkus to znovu.');
    }
}

/**
 * Aktualizace zobrazení výsledků pro jednu otázku
 */
function updateResults(questionId) {
    if (!serverData || !serverData.questions[questionId]) return;

    const data = serverData.questions[questionId];
    const resultsListEl = document.getElementById(`results-list-${questionId}`);
    const totalEl = document.getElementById(`total-${questionId}`);
    if (!resultsListEl || !totalEl) return;

    const totalVotes = Object.values(data.votes).reduce((sum, count) => sum + count, 0);

    resultsListEl.innerHTML = '';

    data.options.forEach(option => {
        const count = data.votes[option];
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <span class="result-label">${option}</span>
            <div class="result-bar-wrapper">
                <div class="result-bar" style="width: ${percentage}%"></div>
                <span class="result-count">${count} hlasů (${Math.round(percentage)}%)</span>
            </div>
        `;
        resultsListEl.appendChild(resultItem);
    });

    totalEl.textContent = `Celkem hlasů: ${totalVotes}`;

    // Aktualizovat hero políčka v záhlaví
    updateHeroCards(questionId);
}

/**
 * Aktualizace výsledkových políček v záhlaví
 */
function updateHeroCards(questionId) {
    if (!serverData || !serverData.questions[questionId]) return;

    const data = serverData.questions[questionId];
    // Mapování názvů možností na ID elementů
    const idMap = {
        'Ano': 'Ano',
        'Zkouším': 'Zkouším',
        'Ne': 'Ne',
        'Jsem profík :-)': 'profik'
    };

    data.options.forEach(option => {
        const elId = `hero-count-${questionId}-${idMap[option] || option}`;
        const el = document.getElementById(elId);
        if (!el) return;

        const newCount = data.votes[option];
        const oldCount = parseInt(el.textContent) || 0;

        if (newCount !== oldCount) {
            el.textContent = newCount;
            // Animace při změně
            el.classList.remove('bump');
            void el.offsetHeight; // force reflow
            el.classList.add('bump');
        }
    });
}

/**
 * Aktualizace všech otázek
 */
function updateAllResults() {
    if (!serverData) return;
    for (const questionId in serverData.questions) {
        updateResults(questionId);
    }
}

/**
 * Zvýraznění tlačítek u otázek, kde uživatel už hlasoval
 */
function highlightUserVotes() {
    for (const questionId in userVotes) {
        const optionsContainer = document.getElementById(`options-${questionId}`);
        if (!optionsContainer) continue;
        const buttons = optionsContainer.querySelectorAll('.option-btn');
        buttons.forEach(btn => {
            const label = btn.querySelector('.card__title').textContent;
            if (label === userVotes[questionId]) {
                btn.classList.add('voted');
            } else {
                btn.classList.add('disabled');
            }
        });
    }
}

/**
 * Pravidelné obnovování výsledků ze serveru (polling)
 */
async function pollResults() {
    await fetchVotes();
    updateAllResults();
}

/**
 * Reset všech hlasů (server + lokální)
 */
async function resetAll() {
    if (!confirm('Opravdu chceš resetovat VŠECHNY hlasy? Toto smaže hlasy všech uživatelů.')) return;

    try {
        // Vytvořit čistá data s nulami
        const freshData = await fetchVotes();
        if (!freshData) return;

        for (const qId in freshData.questions) {
            const q = freshData.questions[qId];
            for (const opt of q.options) {
                q.votes[opt] = 0;
            }
        }

        // Uložit na server
        await fetch(BLOB_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(freshData)
        });

        // Smazat lokální hlasování
        localStorage.removeItem('votingApp_userVotes');
        // Reload stránky
        location.reload();
    } catch (err) {
        alert('Chyba při resetování: ' + err.message);
    }
}

/**
 * Inicializace aplikace
 */
async function init() {
    // Načíst hlasy ze serveru
    await fetchVotes();
    updateAllResults();
    highlightUserVotes();

    // Spustit polling — výsledky se automaticky obnovují
    setInterval(pollResults, POLL_INTERVAL);
}

// Spustit aplikaci po načtení stránky
document.addEventListener('DOMContentLoaded', init);
