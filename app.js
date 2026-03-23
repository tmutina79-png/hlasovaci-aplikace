// === Hlasovací aplikace ===

// Databáze otázek a hlasů
const questionsData = {
    1: {
        question: "Už jsi někdy vytvořil nějakou aplikaci?",
        options: ["Ano", "Zkouším", "Ne", "Jsem profík :-)"],
        votes: {
            "Ano": 0,
            "Zkouším": 0,
            "Ne": 0,
            "Jsem profík :-)": 0
        }
    }
    // Sem přidej další otázky ve stejném formátu
};

// Sledování, zda uživatel už hlasoval
const userVotes = {};

/**
 * Zpracování hlasu
 */
function vote(questionId, answer) {
    // Kontrola, zda už uživatel hlasoval v této otázce
    if (userVotes[questionId]) {
        return;
    }

    // Zaznamenat hlas
    questionsData[questionId].votes[answer]++;
    userVotes[questionId] = answer;

    // Zvýraznit zvolenou odpověď
    const optionsContainer = document.getElementById(`options-${questionId}`);
    const buttons = optionsContainer.querySelectorAll('.option-btn');

    buttons.forEach(btn => {
        const label = btn.querySelector('.card__title').textContent;
        if (label === answer) {
            btn.classList.add('voted');
            btn.classList.add('vote-animation');
        } else {
            btn.classList.add('disabled');
        }
    });

    // Aktualizovat výsledky
    updateResults(questionId);

    // Uložit do localStorage
    saveVotes();
}

/**
 * Aktualizace zobrazení výsledků
 */
function updateResults(questionId) {
    const data = questionsData[questionId];
    const resultsListEl = document.getElementById(`results-list-${questionId}`);
    const totalEl = document.getElementById(`total-${questionId}`);

    // Spočítat celkový počet hlasů
    const totalVotes = Object.values(data.votes).reduce((sum, count) => sum + count, 0);

    // Vygenerovat výsledky
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

    // Celkový počet
    totalEl.textContent = `Celkem hlasů: ${totalVotes}`;
}

/**
 * Uložení hlasů do localStorage
 */
function saveVotes() {
    localStorage.setItem('votingApp_votes', JSON.stringify(questionsData));
    localStorage.setItem('votingApp_userVotes', JSON.stringify(userVotes));
}

/**
 * Načtení hlasů z localStorage
 */
function loadVotes() {
    const savedVotes = localStorage.getItem('votingApp_votes');
    const savedUserVotes = localStorage.getItem('votingApp_userVotes');

    if (savedVotes) {
        const parsed = JSON.parse(savedVotes);
        // Aktualizovat hlasy pro existující otázky
        for (const id in parsed) {
            if (questionsData[id]) {
                questionsData[id].votes = parsed[id].votes;
            }
        }
    }

    if (savedUserVotes) {
        const parsed = JSON.parse(savedUserVotes);
        Object.assign(userVotes, parsed);
    }
}

/**
 * Inicializace aplikace
 */
function init() {
    // Načíst uložené hlasy
    loadVotes();

    // Pro každou otázku zobrazit výsledky a stav tlačítek
    for (const questionId in questionsData) {
        updateResults(questionId);

        // Pokud uživatel už hlasoval, zvýraznit jeho volbu
        if (userVotes[questionId]) {
            const optionsContainer = document.getElementById(`options-${questionId}`);
            if (optionsContainer) {
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
    }
}

// Spustit aplikaci po načtení stránky
document.addEventListener('DOMContentLoaded', init);
