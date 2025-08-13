document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const screens = {
        mainMenu: document.getElementById('main-menu-screen'),
        addPlayer: document.getElementById('add-player-screen'),
        viewStats: document.getElementById('view-stats-screen'),
        startDraft: document.getElementById('start-draft-screen'),
        game: document.getElementById('game-screen'),
        gameOver: document.getElementById('game-over-screen'),
    };

    const buttons = {
        addPlayer: document.getElementById('add-player-btn'),
        viewStats: document.getElementById('view-stats-btn'),
        startDraft: document.getElementById('start-draft-btn'),
        savePlayer: document.getElementById('save-player-btn'),
        beginDraft: document.getElementById('begin-draft-btn'),
        endBattle: document.getElementById('end-battle-btn'),
        backToMain: document.querySelectorAll('.back-to-main'),
    };

    const inputs = {
        newPlayerName: document.getElementById('new-player-name'),
    };

    const containers = {
        stats: document.getElementById('stats-container'),
        draftSetup: document.getElementById('draft-setup-options'),
        gameInfo: document.getElementById('game-info'),
        playerStatus: document.getElementById('player-status-container'),
        battlePairings: document.getElementById('battle-pairings-container'),
        winnerDeclaration: document.getElementById('winner-declaration'),
        finalStandings: document.getElementById('final-standings'),
        eventLog: document.getElementById('event-log'),
    };

    // --- State ---
    let players = [];
    let gameState = {};

    // --- Screen Management ---
    function showScreen(screenName) {
        Object.values(screens).forEach(screen => {
            screen.classList.remove('active');
        });
        screens[screenName].classList.add('active');
    }

    // --- Data Persistence ---
    function loadPlayers() {
        const playersJSON = localStorage.getItem('autoBattlerPlayers');
        if (playersJSON) {
            players = JSON.parse(playersJSON);
        }
    }

    function savePlayers() {
        localStorage.setItem('autoBattlerPlayers', JSON.stringify(players));
    }

    // --- UI Rendering ---
    function setupDraftScreen() {
        containers.draftSetup.innerHTML = ''; // Clear previous setup

        if (players.length < 2) {
            containers.draftSetup.innerHTML = '<p>You need at least 2 saved players to start a draft.</p>';
            buttons.beginDraft.style.display = 'none';
            return;
        }
        buttons.beginDraft.style.display = 'block';

        // --- Number of Players ---
        const numPlayersLabel = document.createElement('label');
        numPlayersLabel.setAttribute('for', 'num-players-select');
        numPlayersLabel.textContent = 'Number of Players: ';
        const numPlayersSelect = document.createElement('select');
        numPlayersSelect.id = 'num-players-select';
        for (let i = 2; i <= Math.min(8, players.length); i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            numPlayersSelect.appendChild(option);
        }
        containers.draftSetup.appendChild(numPlayersLabel);
        containers.draftSetup.appendChild(numPlayersSelect);
        containers.draftSetup.appendChild(document.createElement('br'));

        // --- Pairing Mode ---
        const pairingModeLabel = document.createElement('label');
        pairingModeLabel.setAttribute('for', 'pairing-mode-select');
        pairingModeLabel.textContent = 'Pairing Mode: ';
        const pairingModeSelect = document.createElement('select');
        pairingModeSelect.id = 'pairing-mode-select';
        pairingModeSelect.innerHTML = '<option value="random">Random</option>';
        containers.draftSetup.appendChild(pairingModeLabel);
        containers.draftSetup.appendChild(pairingModeSelect);
        containers.draftSetup.appendChild(document.createElement('br'));


        // --- Player Selectors ---
        const playerSelectorsContainer = document.createElement('div');
        playerSelectorsContainer.id = 'player-selectors-container';
        containers.draftSetup.appendChild(playerSelectorsContainer);

        numPlayersSelect.addEventListener('change', () => {
            const selectedNum = parseInt(numPlayersSelect.value);
            // Add/remove structured pairing option
            if (selectedNum === 4) {
                if (!pairingModeSelect.querySelector('option[value="structured"]')) {
                    pairingModeSelect.innerHTML += '<option value="structured">Structured</option>';
                }
            } else {
                const structuredOption = pairingModeSelect.querySelector('option[value="structured"]');
                if (structuredOption) {
                    structuredOption.remove();
                }
            }
            generatePlayerSelectors(selectedNum);
        });

        // Initial call
        generatePlayerSelectors(parseInt(numPlayersSelect.value));
        if (parseInt(numPlayersSelect.value) === 4) {
            pairingModeSelect.innerHTML += '<option value="structured">Structured</option>';
        }
    }

    // --- Game Logic ---
    function logEvent(message, type = 'info') {
        const p = document.createElement('p');
        p.textContent = message;
        p.className = `event-log-message event-log-${type}`;
        containers.eventLog.appendChild(p);
        containers.eventLog.scrollTop = containers.eventLog.scrollHeight; // Auto-scroll
    }

    function processBattleResults() {
        const poisonMap = { 3: 1, 4: 1, 5: 2, 6: 3, 7: 5, 8: 5 }; // Hand size -> poison
        const poisonToAdd = poisonMap[gameState.handSize] || 5; // Default to 5 for 7+

        gameState.currentPairings.forEach(pairing => {
            if (pairing.result === 'draw') {
                // Both players lose
                const p1 = gameState.activePlayers.find(p => p.id === pairing.player1.id);
                const p2 = gameState.activePlayers.find(p => p.id === pairing.player2.id);
                if (p1) p1.poison += poisonToAdd;
                if (p2) p2.poison += poisonToAdd;
            } else {
                // One winner, one loser
                const loserId = (pairing.result == pairing.player1.id) ? pairing.player2.id : pairing.player1.id;
                const loser = gameState.activePlayers.find(p => p.id === loserId);
                if (loser) loser.poison += poisonToAdd;
            }
        });

        // Check for eliminations
        const newlyEliminated = [];
        gameState.activePlayers.forEach(player => {
            if (!player.isEliminated && player.poison >= 10) {
                player.isEliminated = true;
                player.eliminationRound = gameState.round;
                newlyEliminated.push(player.id);
                logEvent(`${player.name} has been eliminated!`, 'elimination');
            } else if (!player.isEliminated && player.poison > 6) {
                logEvent(`${player.name} is looking unhealthy with ${player.poison} poison...`, 'warning');
            }
        });

        // --- Post-poison resolution ---
        const remainingPlayers = gameState.activePlayers.filter(p => !p.isEliminated);

        // Set placements for newly eliminated players
        if (newlyEliminated.length > 0) {
            const placement = remainingPlayers.length + 1;
            newlyEliminated.forEach(id => {
                const player = gameState.activePlayers.find(p => p.id === id);
                if (player) player.placement = placement;
            });
        }

        if (remainingPlayers.length === 1) {
            handleGameOver(remainingPlayers[0]);
            return; // Stop further processing
        } else if (remainingPlayers.length === 0) {
            // Simultaneous elimination, find the players involved
            const revivedPlayers = [];
            newlyEliminated.forEach(id => {
                const player = gameState.activePlayers.find(p => p.id === id);
                if(player) {
                    player.isEliminated = false;
                    player.poison = 9; // Sudden Death
                    revivedPlayers.push(player.name);
                }
            });
            alert(`SUDDEN DEATH! ${revivedPlayers.join(' and ')} were both eliminated! Their poison is reset to 9. Battle again!`);
        }

        // Update treasures (everyone gets 1, max 5)
        gameState.activePlayers.forEach(player => {
            if (!player.isEliminated) {
                player.treasures = Math.min(5, player.treasures + 1);
            }
        });
    }

    function handleGameOver(winner) {
        winner.placement = 1;

        // Update stats for all players in the main players array
        gameState.activePlayers.forEach(gamePlayer => {
            const playerToUpdate = players.find(p => p.id === gamePlayer.id);
            if (playerToUpdate) {
                playerToUpdate.stats.gamesPlayed++;
                if (gamePlayer.placement) {
                    playerToUpdate.stats.placements[gamePlayer.placement]++;
                }
                if (gamePlayer.isEliminated) {
                    const round = gamePlayer.eliminationRound;
                    playerToUpdate.stats.eliminationRounds[round] = (playerToUpdate.stats.eliminationRounds[round] || 0) + 1;
                }
            }
        });

        savePlayers();

        // Display game over screen
        containers.winnerDeclaration.textContent = `${winner.name} is the Champion!`;

        const standingsBody = gameState.activePlayers
            .sort((a, b) => a.placement - b.placement)
            .map(p => `<tr><td>#${p.placement}</td><td>${p.name}</td></tr>`)
            .join('');
        containers.finalStandings.innerHTML = `<table><tbody>${standingsBody}</tbody></table>`;

        showScreen('gameOver');
    }

    function checkAllMatchesReported() {
        if (!gameState.currentPairings) return;
        const allReported = gameState.currentPairings.every(p => p.result !== null);
        buttons.endRound.disabled = !allReported;
    }

    function generatePairings() {
        let playersToPair = gameState.activePlayers.filter(p => !p.isEliminated && !p.isGhost);

        // Ghost System
        const ghost = gameState.activePlayers.find(p => p.isGhost);
        if (ghost) {
            // Ghost is removed, no longer a ghost
            const formerGhost = players.find(p => p.id === ghost.id);
            if(formerGhost) formerGhost.isGhost = false;
        }

        if (playersToPair.length % 2 !== 0) {
            // Odd number of players, activate a ghost if possible
            // For now, simple logic: last eliminated player becomes ghost.
            // A more robust system would track elimination order.
            const lastEliminated = gameState.history.filter(h => h.type === 'elimination').pop();
            if (lastEliminated) {
                const ghostPlayer = gameState.activePlayers.find(p => p.id === lastEliminated.playerId);
                if (ghostPlayer) {
                    ghostPlayer.isGhost = true;
                    ghostPlayer.poison = 0; // Ghosts lose poison
                    playersToPair.push(ghostPlayer);
                }
            } else {
                // No one eliminated yet, give someone a bye
                // For simplicity, we'll pair them with a "Bye" placeholder
                 playersToPair.push({ id: 'bye', name: 'The Ghost', isBye: true });
            }
        }

        // Simple random pairing for now
        let shuffled = playersToPair.sort(() => 0.5 - Math.random());
        gameState.currentPairings = [];
        for (let i = 0; i < shuffled.length; i += 2) {
            const player1 = shuffled[i];
            const player2 = shuffled[i + 1];
            if (player2) { // Ensure there is a second player
                 gameState.currentPairings.push({
                    player1: player1,
                    player2: player2,
                    result: null // e.g., player1.id, player2.id, or 'draw'
                });
            } else {
                 // This handles the case of a bye if logic gets here
                 gameState.currentPairings.push({ player1: player1, player2: {name: "BYE", id:"bye"}, result: player1.id });
            }
        }
    }

    // --- UI Rendering ---
    function renderGameScreen() {
        renderGameInfo();
        renderPlayerStatus();
        renderBattlePairings();
    }

    function renderGameInfo() {
        const battleInRound = ((gameState.battle - 1) % 3) + 1;
        const isDraft = battleInRound === 1;

        let instructions = `Report results for Battle ${battleInRound} of 3.`;
        if (isDraft && gameState.battle > 1) {
            instructions = `This is a new round! First, draft new cards. Then, report results for Battle ${battleInRound} of 3.`
        }

        containers.gameInfo.innerHTML = `
            <h2>Round ${gameState.round} (Battle ${battleInRound}/3)</h2>
            <p><strong>Current Hand Size: ${gameState.handSize}</strong></p>
            <p class="phase-instructions"><em>${instructions}</em></p>
        `;
    }

    function renderPlayerStatus() {
        containers.playerStatus.innerHTML = '<h2>Player Status</h2>';
        const playerGrid = document.createElement('div');
        playerGrid.className = 'player-status-grid';

        // Sort players: active first, then by name
        const sortedPlayers = [...gameState.activePlayers].sort((a, b) => {
            if (a.isEliminated !== b.isEliminated) {
                return a.isEliminated ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });

        sortedPlayers.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-status-card';
            if (player.isGhost) playerDiv.classList.add('ghost');
            if (player.isEliminated) playerDiv.classList.add('eliminated');

            playerDiv.innerHTML = `
                <h4>${player.name} ${player.isGhost ? '👻' : ''}</h4>
                <p>Poison: ${player.poison}</p>
                <p>Treasures: ${player.treasures}</p>
            `;
            playerGrid.appendChild(playerDiv);
        });
        containers.playerStatus.appendChild(playerGrid);
    }

    function renderBattlePairings() {
        containers.battlePairings.innerHTML = '<h2>Battle Pairings</h2>';
        const pairingsGrid = document.createElement('div');
        pairingsGrid.className = 'pairings-grid';

        if (!gameState.currentPairings) return;

        gameState.currentPairings.forEach((pairing, index) => {
            const p1 = pairing.player1;
            const p2 = pairing.player2;

            const pairingBox = document.createElement('div');
            pairingBox.className = 'pairing-box';

            if (p2.id === 'bye') {
                 pairingBox.innerHTML = `
                    <div class="pairing-names">
                        <span class="player-name">${p1.name}</span>
                        <span class="vs">has a</span>
                        <span class="player-name">BYE</span>
                    </div>
                `;
                pairingBox.classList.add('bye-match');
            } else {
                pairingBox.innerHTML = `
                    <div class="pairing-names">
                        <span class="player-name">${p1.name}</span>
                        <span class="vs">vs.</span>
                        <span class="player-name">${p2.name}</span>
                    </div>
                    <div class="result-buttons" data-match-index="${index}">
                        <button class="winner-btn" data-result="${p1.id}">Winner!</button>
                        <button class="draw-btn" data-result="draw">Draw</button>
                        <button class="winner-btn" data-result="${p2.id}">Winner!</button>
                    </div>
                `;
            }

            // Highlight selected result
            if (pairing.result) {
                const selectedBtn = pairingBox.querySelector(`button[data-result="${pairing.result}"]`);
                if (selectedBtn) {
                    selectedBtn.classList.add('selected');
                }
            }

            pairingsGrid.appendChild(pairingBox);
        });

        containers.battlePairings.appendChild(pairingsGrid);
    }

    function generatePlayerSelectors(num) {
        const container = document.getElementById('player-selectors-container');
        container.innerHTML = '';

        for (let i = 1; i <= num; i++) {
            const label = document.createElement('label');
            label.textContent = `Player ${i}: `;
            const select = document.createElement('select');
            select.className = 'player-select';
            select.innerHTML = '<option value="">-- Select a Player --</option>';

            players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name;
                select.appendChild(option);
            });

            container.appendChild(label);
            container.appendChild(select);
            container.appendChild(document.createElement('br'));
        }
    }

    function loadAndDisplayStats() {
        containers.stats.innerHTML = ''; // Clear previous stats

        if (players.length === 0) {
            containers.stats.innerHTML = '<p>No players found. Add some players first!</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Player Name</th>
                    <th>Games Played</th>
                    <th>Win Rate</th>
                    <th>Avg. Placement</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;
        const tbody = table.querySelector('tbody');

        players.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
            const wins = player.stats.placements['1'] || 0;
            const gamesPlayed = player.stats.gamesPlayed;
            const winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) + '%' : 'N/A';

            let totalPlacement = 0;
            let placementsCount = 0;
            for (const place in player.stats.placements) {
                if (player.stats.placements.hasOwnProperty(place)) {
                    totalPlacement += parseInt(place) * player.stats.placements[place];
                    placementsCount += player.stats.placements[place];
                }
            }
            const avgPlacement = placementsCount > 0 ? (totalPlacement / placementsCount).toFixed(2) : 'N/A';


            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${player.name}</td>
                <td>${gamesPlayed}</td>
                <td>${winRate}</td>
                <td>${avgPlacement}</td>
            `;
            tbody.appendChild(row);
        });

        containers.stats.appendChild(table);
    }

    // --- Event Listeners ---
    buttons.addPlayer.addEventListener('click', () => showScreen('addPlayer'));
    buttons.viewStats.addEventListener('click', () => {
        loadAndDisplayStats();
        showScreen('viewStats');
    });
    buttons.startDraft.addEventListener('click', () => {
        setupDraftScreen();
        showScreen('startDraft');
    });

    buttons.beginDraft.addEventListener('click', () => {
        const selectedPlayerIds = Array.from(document.querySelectorAll('.player-select'))
            .map(select => select.value)
            .filter(id => id !== '');

        if (selectedPlayerIds.length !== parseInt(document.getElementById('num-players-select').value)) {
            alert('Please select a player for each slot.');
            return;
        }

        const uniquePlayerIds = new Set(selectedPlayerIds);
        if (uniquePlayerIds.size !== selectedPlayerIds.length) {
            alert('Each player can only be selected once.');
            return;
        }

        containers.eventLog.innerHTML = ''; // Clear log at start of game
        logEvent(`A new draft has begun with ${uniquePlayerIds.size} players!`);

        // Initialize Game State
        gameState = {
            pairingMode: document.getElementById('pairing-mode-select').value,
            round: 1,
            battle: 1,
            phase: 'Battle',
            handSize: 3,
            activePlayers: players
                .filter(p => uniquePlayerIds.has(String(p.id)))
                .map(p => ({
                    ...p, // Copy original player data
                    poison: 0,
                    treasures: 1,
                    isGhost: false,
                    isEliminated: false,
                    eliminationRound: null,
                    placement: null,
                })),
            history: [],
            currentPairings: [],
        };

        // For the first round, players are paired right away.
        gameState.phase = 'Battle';
        generatePairings();
        renderGameScreen();
        showScreen('game');
    });

    containers.battlePairings.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const resultButtons = e.target.closest('.result-buttons');
        if (!resultButtons) return;

        const matchIndex = resultButtons.dataset.matchIndex;
        const result = button.dataset.result;

        // Update state
        gameState.currentPairings[matchIndex].result = result;

        // Update UI
        // Deselect all buttons in this group first
        resultButtons.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
        // Select the clicked one
        button.classList.add('selected');

        checkAllMatchesReported();
    });

    buttons.savePlayer.addEventListener('click', () => {
        const name = inputs.newPlayerName.value.trim();
        if (name) {
            const newPlayer = {
                id: Date.now(),
                name: name,
                stats: {
                    gamesPlayed: 0,
                    placements: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0 },
                    eliminationRounds: {}
                }
            };
            players.push(newPlayer);
            savePlayers();
            inputs.newPlayerName.value = '';
            alert(`${name} has been added!`); // Using alert for simple feedback for now
            showScreen('mainMenu');
        } else {
            alert('Please enter a player name.');
        }
    });

    buttons.endBattle.addEventListener('click', () => {
        processBattleResults();

        // If game is over, the handler will stop execution. If not, proceed.

        gameState.battle++;

        // After every 3 battles, a full round is over.
        if ((gameState.battle - 1) % 3 === 0) {
            gameState.round++;
            // Increase hand size
            if (gameState.handSize < 8) { // Assuming max hand size of 8
                gameState.handSize++;
                logEvent(`A new round begins! Hand size has increased to ${gameState.handSize}!`, 'positive');
            }
        }

        generatePairings();
        renderGameScreen();
        buttons.endBattle.disabled = true; // Disable until new results are in
    });

    buttons.backToMain.forEach(button => {
        button.addEventListener('click', () => showScreen('mainMenu'));
    });

    // --- Initialization ---
    function init() {
        loadPlayers();
        showScreen('mainMenu');
    }

    init();
});
