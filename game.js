    // --- Firebase SDKs ---
    import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
    import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential, signOut, EmailAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
    import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc, updateDoc, increment, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

     // --- Google Analytics ---
   // GOOGLE ANALYTICS -- import { getAnalytics, logEvent, setUserId } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-analytics.js";
    
    // --- Config ---
    const [GRID_SIZE, GRID_COLS, GAME_TIME] = [16, 4, 60];
    const letterConfig={'A':{p:1},'B':{p:3},'C':{p:3},'D':{p:2},'E':{p:1},'F':{p:4},'G':{p:2},'H':{p:4},'I':{p:1},'J':{p:8},'K':{p:5},'L':{p:1},'M':{p:3},'N':{p:1},'O':{p:1},'P':{p:3},'Q':{p:10},'R':{p:1},'S':{p:1},'T':{p:1},'U':{p:1},'V':{p:4},'W':{p:4},'X':{p:8},'Y':{p:4},'Z':{p:10}};
    const VOWELS = ['A', 'E', 'I', 'O', 'U'];
    const HARD_CONSONANTS = ['J', 'K', 'Q', 'X', 'Z'];
    const LETTER_BAG_STRING = "EEEEEEEEEEEEAAAAAAAAAARRRRRRRRRRIIIIIIIIIOOOOOOOOTTTTTTTTNNNNNNNNSSSSSSSLLLLLLUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";

    // --- DOM Elements ---
    const gameContainer = document.getElementById('game-container');
    const gameContentEl = document.getElementById('game-content');
    const gridContainer = document.getElementById('grid-container');
    const grid = document.getElementById('grid'), lineCanvas = document.getElementById('line-canvas'), ctx = lineCanvas.getContext('2d');
    const scoreEl = document.getElementById('score'), timerEl = document.getElementById('timer');
    const topLeftDisplayEl = document.getElementById('top-left-display');
    const menuContainer = document.getElementById('menu-container');
    const menuButton = document.getElementById('menu-button');
    const currentWordLettersEl = document.getElementById('current-word-letters');
    const messageModal = document.getElementById('message-modal'), modalContent = document.getElementById('modal-content');
    const endGameModal = document.getElementById('end-game-modal'), endGameModalContent = document.getElementById('end-game-modal-content');
    const leaderboardModal = document.getElementById('leaderboard-modal'), leaderboardModalContent = document.getElementById('leaderboard-modal-content');
    const statsModal = document.getElementById('stats-modal'), statsModalContent = document.getElementById('stats-modal-content');

    // --- Dark Mode ---
    function setDarkMode(dark) {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('wordWormDarkMode', dark ? 'true' : 'false');
        document.querySelectorAll('.dark-toggle-track').forEach(el => {
            el.classList.toggle('active', dark);
            el.setAttribute('aria-checked', String(dark));
        });
    }
    setDarkMode(localStorage.getItem('wordWormDarkMode') === 'true');

    // --- Firebase State ---
    let auth, db, userId;
   // GOOGLE ANALYTICS -- let auth, db, userId, analytics;
    const isUserSignedIn = () => auth?.currentUser && !auth.currentUser.isAnonymous;

    async function signInWithProvider(provider) {
        try {
            const result = await linkWithPopup(auth.currentUser, provider);
            const user = result.user;
            userId = user.uid;
            if (db) {
                const playerDocRef = doc(db, "players", user.uid);
                const snap = await getDoc(playerDocRef);
                if (!snap.exists() || !snap.data().hasSubmittedName) {
                    const name = (user.displayName || 'Player').split(' ')[0];
                    await setDoc(playerDocRef, { name, hasSubmittedName: true }, { merge: true });
                    localStorage.setItem('wordRushPlayerName', name);
                } else {
                    localStorage.setItem('wordRushPlayerName', snap.data().name);
                }
            }
            return user;
        } catch (err) {
            if (err.code === 'auth/credential-already-in-use' || err.code === 'auth/email-already-in-use') {
                const result = await signInWithPopup(auth, provider);
                const user = result.user;
                userId = user.uid;
                if (db) {
                    const playerDocRef = doc(db, "players", user.uid);
                    const snap = await getDoc(playerDocRef);
                    if (snap.exists() && snap.data().name) {
                        localStorage.setItem('wordRushPlayerName', snap.data().name);
                    }
                }
                return user;
            }
            throw err;
        }
    }

    // --- Game State ---
    let score = 0, timer = GAME_TIME, timerInterval, foundWords = [], selectedTiles = [], isMouseDown = false;
    let validationTrie;       // For checking if a board is playable
    let fullDictionaryTrie;   // For checking player-submitted words
    let tilePositions = [];
    let isPracticeMode = false;
    let practiceTimeElapsed = 0;
    let animationInterval;
    let currentGamemode = 'standard';
    let dailyChallengeData = null; 
    let allDailyWords = new Set();
    let activeGridEl;
    let activeCanvasEl;
    let activeCtx;

    /// --- Trie Data Structure ---
    class Trie {
        constructor(data = null) {
            this.root = data || {}; 
        }
        search(word, isPrefix = false) {
            let node = this.root;
            for (const char of word) {
                if (!node[char]) return false;
                node = node[char];
            }
            return isPrefix ? true : node.isEndOfWord === true;
        }
    }


    // Creates a seed (a number) from any string (like a date)
function stringToSeed(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

// A simple seeded random number generator (PRNG)
function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**
 * Creates the board for the daily challenge, ensuring it meets specific quality criteria.
 * @returns {Object} An object containing the board array and the set of all possible words.
 */
function createDailyChallengeBoard() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    let attempt = 0;

    while (attempt < 2000) {
        const seed = stringToSeed(`${todayStr}-${attempt}`);
        const rng = mulberry32(seed);
        const board = new Array(GRID_SIZE).fill(null).map(() => getRandomLetterSeeded(rng));

        // --- 1. Basic Board Health Checks ---
        const vowelCount = board.filter(letter => VOWELS.includes(letter)).length;
        if (vowelCount < 4 || vowelCount > 8) { attempt++; continue; }
        const hardConsonantCount = board.filter(letter => HARD_CONSONANTS.includes(letter)).length;
        if (hardConsonantCount > 2) { attempt++; continue; }
        const qIndex = board.indexOf("Q");
        if (qIndex !== -1 && !getNeighbors(qIndex, board).some(letter => letter === "U")) { attempt++; continue; }
        if (!checkNoClumps(board)) { attempt++; continue; }

        // --- 2. Word-Based Validation ---
        const commonWords = solveBoard(board, validationTrie);
        const allWords = solveBoard(board, fullDictionaryTrie);

        // ✅ FIX: The rule is now simpler: just require at least one word that is 6+ letters long.
        const hasLongWord = Array.from(allWords).some(w => w.length >= 6);

        // Check our main rules plus the new long word rule.
        if (commonWords.size >= 30 && allWords.size <= 60 && hasLongWord) {
            console.log(`Daily board found for ${todayStr} in ${attempt + 1} attempts.`);
            console.log(`Board Stats: ${commonWords.size} common, ${allWords.size - commonWords.size} non-common. Total: ${allWords.size}.`);
            console.log("All possible daily words:", Array.from(allWords).sort());
            
            const indices = Array.from({length: 16}, (_, i) => i);
            let bonusTypes = ['DW', 'DW', 'TL', 'DL', 'DL', 'DL'];

            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            for (let i = bonusTypes.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [bonusTypes[i], bonusTypes[j]] = [bonusTypes[j], bonusTypes[i]];
            }

            const bonuses = indices.slice(0, 6).map((tileIndex, i) => ({
                index: tileIndex,
                type: bonusTypes[i]
            }));

            return {
                board: board,
                allWords: allWords,
                bonuses: []
            };
        }
        
        attempt++;
    }

    console.error("Failed to generate a daily board that meets the criteria.");
    return { board: ['W','O','R','D','W','O','R','M','G','A','M','E','P','L','A','Y'], allWords: new Set(), bonuses: [] };
}

    // --- Init ---
    function main() {
        setupEventListeners();
        topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">0</div>`;
        showWelcomeScreen();
        loadAssets(); 
    }

async function showDailyEndScreen(stats, isNewSubmission = true) {
    endGameModal.classList.remove('hidden');
    endGameModalContent.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
            <h2 class="text-2xl font-black text-green-500">Daily Challenge Complete!</h2>
            <p class="text-slate-600 my-4">Calculating your final results...</p>
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
        </div>`;

    if (isNewSubmission) {
        if (activeGridEl) activeGridEl.style.pointerEvents = 'none';

        if (db && userId) {
            try {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                const dailyDocRef = doc(db, `players/${userId}/dailyChallenges`, todayStr);
                await setDoc(dailyDocRef, { completed: true, score: stats.score, foundWords: stats.foundWords }, { merge: true });
                localStorage.removeItem(`dailyProgress-${todayStr}`);
            } catch (error) {
                console.error("Error marking daily challenge as complete:", error);
            }
        }
    }
    
    const foundWordsSet = new Set(stats.foundWords.map(fw => fw.word));
    const allWordsSorted = Array.from(allDailyWords).sort();
    const allWordsHTML = allWordsSorted.map(word => {
        const isFound = foundWordsSet.has(word);
        const tileClasses = isFound ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        return `<span class="${tileClasses} font-semibold text-xs px-2 py-1 rounded-md shadow-sm">${word.toUpperCase()}</span>`;
    }).join('');

    const foundCount = stats.foundWords.length;
    const totalCount = stats.totalCount;
    const percentage = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;

    endGameModalContent.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
             <h2 class="text-2xl font-black text-green-500">Daily Challenge Complete!</h2>
            <p class="text-slate-600 mb-2 mt-2">Your final score is:</p>
            <p id="final-score-display" class="text-6xl font-black text-slate-800 mb-3">${stats.score}</p>
            <div id="daily-summary-container" class="flex items-center justify-center"></div>
            <hr class="my-4">
            <div class="text-left w-full">
                <h3 class="text-lg font-bold text-slate-700 mb-2">All Possible Words (${foundCount}/${totalCount})</h3>
                <div class="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-2">${allWordsHTML}</div>
            </div>
            <div id="share-link-container" class="h-10 flex items-center justify-center mt-4"></div>
            <div class="flex space-x-2 mt-2">
                <button id="endgame-leaderboard-button" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-lg text-base flex-1">Leaderboard</button>
                <button id="return-home-button" class="bg-green-500 hover:bg-green-600 w-full text-white font-bold py-3 px-4 rounded-lg text-base flex-1">Return Home</button>
            </div>
            <div class="text-center text-xs text-slate-400 mt-4">
                <p>&copy; 2026 Word Worm</p>
                <p><a href="/about.html" class="hover:underline">About</a> &bull; <a href="/contact.html" class="hover:underline">Contact</a> &bull; <a href="/privacy.html" class="hover:underline">Privacy Policy</a> &bull; <a href="/terms.html" class="hover:underline">Terms of Use</a></p>
            </div>
        </div>`;
    
    const summaryContainer = document.getElementById('daily-summary-container');
    const showSummaryText = () => {
        const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;
        summaryContainer.innerHTML = `<p class="text-base font-bold text-green-600 flex items-center justify-center">${checkIcon}<span>You found ${foundCount} / ${totalCount} words (${percentage}%)</span></p>`;
    };

    const savedName = localStorage.getItem('wordRushPlayerName');
    if (isNewSubmission && !savedName) {
        summaryContainer.innerHTML = `
            <div class="w-full py-1">
                <div class="flex gap-2">
                    <input id="daily-name-input" type="text" maxlength="10" placeholder="Enter your name"
                        class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-400">
                    <button id="daily-name-submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Submit</button>
                </div>
                <button id="daily-create-account" class="text-xs text-green-500 hover:text-green-600 hover:underline mt-2 flex items-center py-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 flex-shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>Sign up to save stats across devices</button>
            </div>`;

        const doSubmitName = async (name) => {
            localStorage.setItem('wordRushPlayerName', name);
            if (db && userId) {
                try { await setDoc(doc(db, 'players', userId), { name, hasSubmittedName: true }, { merge: true }); } catch(e) {}
            }
            await submitDailyScoreToLeaderboard(stats.score);
            showSummaryText();
        };

        // Resolve automatically if the user completes sign-up via the account modal
        const unsubscribeDailyAuth = onAuthStateChanged(auth, async (user) => {
            if (user && !user.isAnonymous) {
                unsubscribeDailyAuth();
                const name = localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player';
                await doSubmitName(name);
            }
        });

        document.getElementById('daily-name-submit').onclick = async () => {
            const name = (document.getElementById('daily-name-input').value || '').trim().slice(0, 10);
            if (!name) return;
            unsubscribeDailyAuth();
            await doSubmitName(name);
        };
        document.getElementById('daily-name-input').onkeydown = async (e) => {
            if (e.key !== 'Enter') return;
            const name = (document.getElementById('daily-name-input').value || '').trim().slice(0, 10);
            if (!name) return;
            unsubscribeDailyAuth();
            await doSubmitName(name);
        };
        document.getElementById('daily-create-account').onclick = () => showAccountModal();
    } else {
        if (isNewSubmission) {
            await submitDailyScoreToLeaderboard(stats.score);
        }
        showSummaryText();
    }
    
    const scoreDisplay = document.getElementById('final-score-display');
    if (scoreDisplay) {
        triggerEndGameConfetti(scoreDisplay);
    }
    
    document.getElementById('return-home-button').onclick = resetGame;
    document.getElementById('endgame-leaderboard-button').onclick = () => showLeaderboardModal(currentGamemode === 'daily' ? 'challenge' : 'daily');

    const shareLinkContainer = document.getElementById('share-link-container');
    if (navigator.share || navigator.clipboard) {
        const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>`;        shareLinkContainer.innerHTML = `<a href="#" id="share-score-link" class="flex items-center text-blue-500 hover:underline font-bold">${shareIcon} Share Score</a>`;
        document.getElementById('share-score-link').onclick = (e) => { e.preventDefault(); shareScore(); };
    }
}

function showSubmitConfirmation() {
    const modal = document.getElementById('message-modal');
    const content = document.getElementById('modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-xs mx-auto modal-enter">
            <div class="flex justify-center items-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 class="text-xl font-bold text-slate-800">You've found ${foundWords.length}/${allDailyWords.size} words!</h3>
            <p class="text-sm text-slate-500 mt-2 mb-6">Ready to submit? You can only play the daily challenge once per day.</p>
            <div class="flex space-x-2">
                <button id="cancel-submit-button" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-lg text-base flex-1">Cancel</button>
                <button id="confirm-submit-button" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex-1">Submit</button>
            </div>
        </div>
    `;

    const confirmBtn = document.getElementById('confirm-submit-button');
    const cancelBtn = document.getElementById('cancel-submit-button');

    const hideModal = () => {
        modal.classList.add('hidden');
        modal.style.zIndex = ''; 
        content.innerHTML = ''; 
    };

    confirmBtn.onclick = () => {
        // ✅ FIX: 1. Immediately hide the confirmation and show the loading screen.
        hideModal();
        const stats = { score: score, foundWords: foundWords, totalCount: allDailyWords.size };
        endGameModal.classList.remove('hidden');
        endGameModalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
                <h2 class="text-2xl font-black text-green-500">Daily Challenge Complete!</h2>
                <p class="text-slate-600 my-4">Submitting your score...</p>
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            </div>`;

        // ✅ FIX: 2. Use a timeout to run the slow database logic AFTER the screen updates.
        setTimeout(() => {
            showDailyEndScreen(stats, true);
        }, 100); // A tiny delay is all that's needed
    };

    cancelBtn.onclick = hideModal;
    modal.onclick = (e) => { if (e.target === modal) hideModal(); };
    modal.style.zIndex = '40';
    modal.classList.remove('hidden');
}
    
    async function loadAssets() {
    const playGameModeButton = document.getElementById('play-game-mode-button');
    const playPracticeButton = document.getElementById('play-practice-button');
    const dailyChallengeButton = document.getElementById('play-daily-button');
    const loadingErrorEl = document.getElementById('loading-error');
    const globalPlayCountSpan = document.getElementById('global-play-count');

    const initializeFirebase = async () => {
        try {
            // ✅ FIX: Check if Firebase is already initialized to prevent errors
            if (getApps().length > 0) {
                return; // If it is, don't do anything.
            }

            // REMOVE THIS IN PROD

                            const firebaseConfig = {
  apiKey: "AIzaSyC_DYC4l4DxZNBpOF-1tWlTJj0pG8910F0",
  authDomain: "wordworm-test-c7f3a.firebaseapp.com",
  projectId: "wordworm-test-c7f3a",
  storageBucket: "wordworm-test-c7f3a.firebasestorage.app",
  messagingSenderId: "912527691093",
  appId: "1:912527691093:web:bd22a2205b39f009e1b3dc"

};

// PROD API SET UP GOOGLE ANALYTICS
  //  const firebaseConfig = {
     //           apiKey: "AIzaSyBa2DPRjwaI-G5mz-OmHVXEDJ4_MzBAZgA",
       //         authDomain: "word-rush-game-9010a.firebaseapp.com",
         //       projectId: "word-rush-game-9010a",
           //     storageBucket: "word-rush-game-9010a.firebasestorage.app",
             //   messagingSenderId: "551838491871",
               // appId: "1:551838491871:web:757325be04daab9289b56a",
              //  measurementId: "G-D0TSQFY1XS"
               // };

            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            // GOOGLE ANALYTICS -- analytics = getAnalytics(app);


            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                 
                    // GOOGLE ANALYTICS -- if (analytics && userId) {
                   //     setUserId(analytics, userId);
                  //  }

                    console.log("Firebase connected. User ID:", userId);
                    fetchGlobalStats();
                    fetchPlayerStats(userId);
                } else {
                    signInAnonymously(auth).catch(err => console.error("Anonymous sign-in failed:", err));
                }
            });
        } catch (firebaseError) {
            console.warn("Firebase features failed to load, continuing in offline mode:", firebaseError);
            if (globalPlayCountSpan) globalPlayCountSpan.textContent = "N/A";
        }
    };
    
    const loadDictionaryAndEnableButtons = async () => {
        if (playGameModeButton && playGameModeButton.disabled) return; // Don't re-run if already loaded
        
        if (playGameModeButton) {
            playGameModeButton.disabled = true;
            playGameModeButton.innerHTML = `<div class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading...</span></div>`;
        }
        if (playPracticeButton) { playPracticeButton.disabled = true; }
        if (dailyChallengeButton) {
            dailyChallengeButton.disabled = true;
            dailyChallengeButton.innerHTML = `<div class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading...</span></div>`;
        }
        
        try {
            if (fullDictionaryTrie) { // Dictionaries are already loaded
                console.log("Dictionaries already loaded.");
            } else {
                const [commonRes, fullRes] = await Promise.all([
                    fetch('assets/common-dictionary.json'),
                    fetch('assets/scrabble-dictionary.json')
                ]);
                if (!commonRes.ok || !fullRes.ok) throw new Error(`Dictionary download failed`);
                validationTrie = new Trie(await commonRes.json());
                fullDictionaryTrie = new Trie(await fullRes.json());
                console.log("Both dictionaries loaded. Game is playable.");
            }

            if (playGameModeButton) {
                playGameModeButton.disabled = false;
                playGameModeButton.innerHTML = `<div class="flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="white" class="w-6 h-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg><span>Play</span></div>`;
            }
            if (playPracticeButton) { playPracticeButton.disabled = false; }
            if (dailyChallengeButton) {
                dailyChallengeButton.disabled = false;
                dailyChallengeButton.innerHTML = `<div class="flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" /></svg><span>Daily Challenge</span></div>`;
            }

        } catch (e) {
            console.error("Critical Asset loading failed (Dictionaries):", e);
            if (loadingErrorEl) loadingErrorEl.textContent = "Error: Could not load game dictionaries.";
            if (playGameModeButton) { playGameModeButton.innerHTML = `<span>Error</span>`; playGameModeButton.classList.add('bg-red-500'); }
            if (playPracticeButton) { playPracticeButton.innerHTML = `<span>Error</span>`; playPracticeButton.classList.add('bg-red-500'); }
            if (dailyChallengeButton) { dailyChallengeButton.innerHTML = `<span>Error</span>`; dailyChallengeButton.classList.add('bg-red-500'); }
        }
    };
    
    initializeFirebase();
    loadDictionaryAndEnableButtons();
}

function showGameMessage(message, type = 'info', startTile = null) {
    const colors = {
        info: 'bg-slate-700',
        error: 'bg-red-500',
        success: 'bg-green-500'
    };

    // ✅ FIX: In daily mode, center the message over the grid and apply a shake animation.
    if (currentGamemode === 'daily' && activeGridEl) {
        const gridWrapper = activeGridEl.parentElement;
        if (gridWrapper) {
            gridWrapper.style.position = 'relative'; 
            const messageEl = document.createElement('div');
            // Add the new animate-shake class
            messageEl.className = `animate-shake absolute top-1/2 left-1/2 ${colors[type]} text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg z-20`;
            messageEl.textContent = message;
            
            gridWrapper.appendChild(messageEl);
            // The message will disappear after the animation (1s)
            setTimeout(() => messageEl.remove(), 1000); 
        }
        return; 
    }

    // --- Fallback for other game modes ---
    const parentEl = document.body;
    const messageEl = document.createElement('div');
    messageEl.className = `game-message fixed bottom-20 left-1/2 -translate-x-1/2 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg ${colors[type]}`;
    messageEl.textContent = message;
    parentEl.appendChild(messageEl);
    setTimeout(() => messageEl.remove(), 1000);
}

    async function fetchGlobalStats() {
        const globalPlayCountSpan = document.getElementById('global-play-count');
        if (!db || !globalPlayCountSpan) return;
        try {
            const statsRef = doc(db, "gameStats", "stats");
            const docSnap = await getDoc(statsRef);
            if (docSnap.exists()) {
                globalPlayCountSpan.textContent = docSnap.data().playCount.toLocaleString();
            } else {
                globalPlayCountSpan.textContent = "0";
            }
        } catch(e) {
            console.warn("Could not fetch global stats:", e);
            if (globalPlayCountSpan) globalPlayCountSpan.textContent = "N/A";
        }
    }

    async function fetchPlayerStats(uid) {
    if (!db) return;
    const playerDocRef = doc(db, "players", uid);
    try {
        const docSnap = await getDoc(playerDocRef);
        let highScore = 0;
        let playerName = 'Anonymous';
        let playStreak = 0;

        if (docSnap.exists()) {
            const playerData = docSnap.data();
            highScore = playerData.highScore || 0;
            playerName = playerData.name && playerData.name !== 'Anonymous' ? playerData.name : 'Anonymous';
            playStreak = playerData.playStreak || 0;
        }

        // For signed-in users Firestore is authoritative; for anonymous users prefer localStorage
        // so a saved guest name isn't overwritten by 'Anonymous' from an empty Firestore doc.
        if (!isUserSignedIn() && playerName === 'Anonymous') {
            playerName = localStorage.getItem('wordRushPlayerName') || 'Anonymous';
        }
        if (playerName !== 'Anonymous') {
            localStorage.setItem('wordRushPlayerName', playerName);
        }

        const highScoreEl = document.getElementById('high-score');
        if (highScoreEl) highScoreEl.textContent = highScore;

        const welcomeHighScoreEl = document.getElementById('welcome-high-score');
        if (welcomeHighScoreEl) welcomeHighScoreEl.textContent = highScore.toLocaleString();

        const welcomeStreakEl = document.getElementById('welcome-streak');
        if (welcomeStreakEl) welcomeStreakEl.textContent = playStreak;

        const playerGreetingEl = document.getElementById('player-greeting');
        if (playerGreetingEl) {
            if (playerName !== 'Anonymous') {
                if (isUserSignedIn()) {
                    playerGreetingEl.innerHTML = `Welcome back, <strong class="font-bold">${playerName}</strong>!`;
                } else {
                    playerGreetingEl.innerHTML = `Welcome back, <strong class="font-bold">${playerName}</strong>! &bull; <span id="greeting-signin-link" class="text-blue-500 hover:underline cursor-pointer">Sign up</span>`;
                    setTimeout(() => {
                        const link = document.getElementById('greeting-signin-link');
                        if (link) link.onclick = () => showAccountModal();
                    }, 0);
                }
            } else {
                playerGreetingEl.innerHTML = `Playing as <strong class="font-bold">Guest</strong> &bull; <span id="greeting-signin-link" class="text-blue-500 hover:underline cursor-pointer">Sign in</span>`;
                setTimeout(() => {
                    const link = document.getElementById('greeting-signin-link');
                    if (link) link.onclick = () => showAccountModal();
                }, 0);
            }
        }

        const accountBtn = document.getElementById('account-btn');
        if (accountBtn && isUserSignedIn()) {
            accountBtn.className = 'p-1 rounded-full text-green-500 hover:text-slate-700 hover:bg-slate-100 transition-colors';
            accountBtn.title = 'Your account';
            accountBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clip-rule="evenodd" /></svg>`;
        }

    } catch (e) {
        console.error("Could not fetch player stats:", e);
    }
}
    
   function createGrid(board, gridEl, bonuses = null) {
    if (!gridEl) return; 

    gridEl.innerHTML = ''; 
    const bonusLabels = {
        'DL': { label: 'DL', class: 'bonus-DL' },
        'TL': { label: 'TL', class: 'bonus-TL' },
        'DW': { label: 'DW', class: 'bonus-DW' },
    };
    
    board.forEach((letterData, i) => {
        const letter = typeof letterData === 'object' ? letterData.letter : letterData;
        const points = letterConfig[letter].p;
        const tile = document.createElement('div');
        tile.className = 'tile w-full aspect-square border-2 border-slate-300 bg-white rounded-lg flex items-center justify-center text-3xl font-bold text-slate-800 cursor-pointer';
        tile.dataset.letter = letter;
        tile.dataset.points = points;
        tile.dataset.id = i;
        tile.innerHTML = `<span>${letter}<sub class="text-xs font-semibold ml-1">${points}</sub></span>`;
        
        let bonusType = null;
        // ✅ FIX: Check for deterministic bonuses first
        if (bonuses) {
            const bonusInfo = bonuses.find(b => b.index === i);
            if (bonusInfo) {
                bonusType = bonusLabels[bonusInfo.type];
                tile.dataset.bonus = bonusInfo.type;
            }
        } else {
             // ✅ FIX: Add a check to prevent bonus tiles in the daily challenge
            if (currentGamemode !== 'daily') {
                const randomBonus = getBonusType();
                if (randomBonus) {
                    bonusType = randomBonus;
                    tile.dataset.bonus = randomBonus.type;
                }
        }
    }

        if (bonusType) {
            tile.classList.add(bonusType.class);
            tile.innerHTML += `<div class="bonus-label">${bonusType.label}</div>`;
        }

        gridEl.appendChild(tile);
    });
}
    
    function getRandomLetter() { return LETTER_BAG_STRING[Math.floor(Math.random() * LETTER_BAG_STRING.length)]; }
   
   function getRandomLetterSeeded(rng) {
    // This is the same logic, but uses our predictable 'rng' function
    return LETTER_BAG_STRING[Math.floor(rng() * LETTER_BAG_STRING.length)];
}
   
    function getBonusType() {
        const rand = Math.random();
        if (rand < 0.08) return { type: 'Time', label: '+5s', class: 'bonus-Time' };
        if (rand < 0.18) return { type: 'DW', label: 'DW', class: 'bonus-DW' };
        if (rand < 0.28) return { type: 'TL', label: 'TL', class: 'bonus-TL' };
        if (rand < 0.40) return { type: 'DL', label: 'DL', class: 'bonus-DL' };
        return null;
    }

    function getBonusTypeSeeded(rng) {
    // This is the same logic, but uses our predictable 'rng' function
    const rand = rng(); 
    if (rand < 0.18) return { type: 'DW', label: 'DW', class: 'bonus-DW' };
    if (rand < 0.28) return { type: 'TL', label: 'TL', class: 'bonus-TL' };
    if (rand < 0.40) return { type: 'DL', label: 'DL', class: 'bonus-DL' };
    return null;
}

async function getDailyPuzzleWithTimeout() {
    const startTime = Date.now();
    const timeout = 10000; // 10 seconds in milliseconds
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    while (Date.now() - startTime < timeout) {
        try {
            // First, try to get from cache
            const cachedPuzzleJSON = localStorage.getItem(`dailyPuzzle-${todayStr}`);
            if (cachedPuzzleJSON) {
                console.log("Loaded daily puzzle from cache.");
                return JSON.parse(cachedPuzzleJSON);
            }

            // If not in cache, try to get from Firestore
            if (db) {
                const puzzleRef = doc(db, "dailyPuzzles", todayStr);
                const docSnap = await getDoc(puzzleRef);
                if (docSnap.exists()) {
                    console.log("Fetched pre-made daily puzzle from Firestore.");
                    const puzzle = docSnap.data();
                    // Save to cache for next time
                    localStorage.setItem(`dailyPuzzle-${todayStr}`, JSON.stringify(puzzle));
                    return puzzle;
                }
            }
        } catch (e) {
            console.error("Error during puzzle fetch attempt:", e);
        }
        
        // If not found, wait 1.5 seconds before the next attempt
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // If the while loop finishes, it means we timed out
    return null;
}

 async function startGame(practiceMode = false, gameMode = 'standard') {
    if (!db) {
        showGameMessage("Connecting...");
        return;
    }

    if (gameMode === 'daily') {
        const dailyButton = document.getElementById('play-daily-button');
        if (!dailyButton || dailyButton.disabled) return;
        const originalButtonHTML = dailyButton.innerHTML;
        dailyButton.disabled = true;
        dailyButton.innerHTML = `<div class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading...</span></div>`;

        const puzzleData = await getDailyPuzzleWithTimeout();

        if (!puzzleData) {
            showGameMessage("Today's puzzle isn't ready. Please try again later.", "error");
            dailyButton.disabled = false;
            dailyButton.innerHTML = originalButtonHTML;
            return;
        }
        
        allDailyWords = new Set(puzzleData.allWords);
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        let hasCompleted = false;
        let finalSavedData = null;

        // ✅ 1. First, check Firebase ONLY to see if the challenge is already completed.
        if (db && userId) {
            const dailyDocRef = doc(db, `players/${userId}/dailyChallenges`, todayStr);
            try {
                const docSnap = await getDoc(dailyDocRef);
                if (docSnap.exists() && docSnap.data().completed === true) {
                    hasCompleted = true;
                    finalSavedData = docSnap.data();
                }
            } catch (e) { console.error("Error loading daily completion status from Firebase:", e); }
        }

        if (hasCompleted) {
            // If completed, show the end screen with final data from Firebase.
            // Make sure we set currentGamemode before showing the end screen
            currentGamemode = 'daily';
            const finalStats = { score: finalSavedData.score || 0, foundWords: finalSavedData.foundWords || [], totalCount: allDailyWords.size };
            showDailyEndScreen(finalStats, false);
            return;
        }

        // ✅ 2. If not completed, try to load the IN-PROGRESS game from Local Storage.
        try {
            const savedProgressJSON = localStorage.getItem(`dailyProgress-${todayStr}`);
            if (savedProgressJSON) {
                const savedData = JSON.parse(savedProgressJSON);
                score = savedData.score || 0;
                foundWords = savedData.foundWords || [];
                console.log("Loaded in-progress game from Local Storage.");
            } else {
                score = 0;
                foundWords = [];
            }
        } catch (e) {
            console.error("Failed to load progress from Local Storage:", e);
            score = 0;
            foundWords = [];
        }
        
        messageModal.classList.add('hidden');
        currentGamemode = 'daily';
        setupDailyUI({ ...puzzleData, allWords: allDailyWords });
        return;

    } else { // --- Standard & Practice Mode Logic ---
        // Reset end game guard flag
        isEndingGame = false;
        // Clear any existing timer interval
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('daily-challenge-content').style.display = 'none';
        gameContentEl.style.display = 'block';
        currentGamemode = practiceMode ? 'practice' : 'standard';
        isPracticeMode = practiceMode;
        menuContainer.classList.remove('hidden');
        clearInterval(timerInterval);
        score = 0;
        foundWords = [];
        updateScoreDisplay();
        if (isPracticeMode) {
            practiceTimeElapsed = 0;
            topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-blue-500 uppercase tracking-wider">Pace</div><div id="pace-score" class="text-3xl font-black text-blue-400">0</div>`;
            updatePracticeUI();
            timerInterval = setInterval(() => { practiceTimeElapsed++; updatePracticeUI(); }, 1000);
        } else {
            const highScoreEl = document.getElementById('high-score');
            const currentHighScore = highScoreEl ? highScoreEl.textContent : '0';
            topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">${currentHighScore}</div>`;
            timer = GAME_TIME;
            updateTimerUI();
            if (db) { 
                const statsRef = doc(db, "gameStats", "stats");
                setDoc(statsRef, { playCount: increment(1) }, { merge: true }).catch(console.warn);
            }
            timerInterval = setInterval(() => { timer--; updateTimerUI(); if (timer <= 0) endGame(); }, 1000);
        }
        messageModal.classList.add('hidden');
        clearInterval(animationInterval);
        activeGridEl = document.getElementById('grid');
        activeCanvasEl = document.getElementById('line-canvas');
        activeCtx = activeCanvasEl.getContext('2d');
        createGrid(generateAndValidateBoard(), activeGridEl);
        attachGridListeners(activeGridEl);
        activeGridEl.style.pointerEvents = 'auto';
    }
}

function resetGame() {
    clearInterval(timerInterval);
    endGameModal.classList.add('hidden');
    statsModal.classList.add('hidden');
    gameContentEl.style.display = 'none';
    document.getElementById('daily-challenge-content').style.display = 'none';
    score = 0;
    foundWords = [];
    updateScoreDisplay();

    const highScoreEl = document.getElementById('high-score');
    const currentHighScore = highScoreEl ? highScoreEl.textContent : '0';

    topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">${currentHighScore}</div>`;
    
    showWelcomeScreen();
    // ✅ FIX: Manually re-fetch player stats to update the welcome screen
    if (userId) {
        fetchPlayerStats(userId);
    }
}

 // ✅ ADD THIS ENTIRE NEW FUNCTION
function attachGridListeners(gridEl) {
    if (!gridEl) return;

    const startInteraction = e => {
        e.preventDefault();
        isMouseDown = true;
        clearSelection();
        const tile = getTileFromEvent(e);
        handleInteraction(tile);
    };
    
    const moveInteraction = e => {
        if (!isMouseDown) return;
        e.preventDefault();
        const tile = getTileFromEvent(e);
        handleInteraction(tile);
    };

    const endInteraction = () => {
        if (!isMouseDown) return;
        submitWord();
        isMouseDown = false;
    };

    // Remove old listeners to prevent duplicates, then add new ones
    gridEl.removeEventListener('pointerdown', startInteraction);
    gridEl.removeEventListener('pointermove', moveInteraction);
    gridEl.removeEventListener('pointerup', endInteraction);
    gridEl.removeEventListener('pointerleave', endInteraction);

    gridEl.addEventListener('pointerdown', startInteraction);
    gridEl.addEventListener('pointermove', moveInteraction);
    gridEl.addEventListener('pointerup', endInteraction);
    gridEl.addEventListener('pointerleave', endInteraction);

    // Initial resize and setup listener for window resizing
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function setupDailyUI(challengeData) {
    gameContentEl.style.display = 'none';
    const dailyChallengeContentEl = document.getElementById('daily-challenge-content');
    dailyChallengeContentEl.style.display = 'block';
    menuContainer.classList.remove('hidden');

    const totalWords = challengeData.allWords.size;
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateString = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(-2)}`;
    
    dailyChallengeContentEl.innerHTML = `
        <div class="w-full max-w-sm mx-auto">
            <div class="flex items-center justify-between mb-3">
                <div class="flex-grow flex items-center justify-center">
                    <h1 class="text-3xl font-black text-slate-800 tracking-tighter flex items-center justify-center">
                        <img src="assets/word-worm-logo-icon.webp" alt="Word Worm Logo" class="w-9 h-9 mr-2" width="36" height="36">
                        <span>Word Worm</span>
                    </h1>
                </div>
            </div>
            
            <div id="daily-stats-box" class="bg-white rounded-xl shadow-md p-3 mb-3">
                <div class="flex items-center">
                    <div class="text-left">
                        <div class="text-xs font-bold text-slate-500">WORDS</div>
                        <div id="daily-word-count" class="text-3xl font-black text-slate-800">0 / ${totalWords}</div>
                    </div>
                    <div class="flex-1 text-center px-2">
                        <div class="text-xs font-bold text-slate-500">SCORE</div>
                        <div id="daily-score" class="text-3xl font-black text-amber-500">0</div>
                    </div>
                    <div class="text-right">
                        <button id="done-button" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm shadow-md flex items-center ml-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 mr-1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            <span>Submit</span>
                        </button>
                    </div>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-2 mt-2">
                    <div id="daily-progress-bar" class="bg-green-500 h-2 rounded-full" style="width: 0%;"></div>
                </div>
            </div>

            <div id="accordion-container" class="relative z-30 mb-3">
                <button id="accordion-trigger" class="w-full flex justify-between items-center p-3 bg-white rounded-xl shadow-md">
                    <div id="collapsed-view" class="flex-grow flex items-center gap-2 overflow-hidden pr-2">
                        <div id="instruction-text" class="text-xs text-slate-500 w-full pr-2"><strong>Daily Challenge (${dateString}):</strong> Find as many words as possible, then hit Submit when done!</div>
                        <div id="last-found-view" class="hidden flex-grow flex items-center gap-2 overflow-hidden">
                            <span class="text-xs font-bold text-slate-500 shrink-0">LAST FOUND:</span>
                            <div id="recent-words-display" class="flex gap-2 flex-nowrap"></div>
                        </div>
                    </div>
                    <div id="expanded-view" class="hidden flex-grow text-sm font-bold text-slate-700">
                        <span id="accordion-summary-text"></span>
                    </div>
                    <svg id="accordion-arrow" class="w-4 h-4 text-slate-500 shrink-0 transition-transform" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                
                <div id="accordion-content" class="hidden absolute top-full left-0 w-full mt-1 bg-white shadow-lg rounded-xl p-4 border">
                    <div id="daily-found-words-list" class="flex flex-wrap gap-2 max-h-32 overflow-y-auto mb-4 pb-4 border-b"></div>
                    <div class="grid grid-cols-2 gap-x-4">
                        <div class="mb-4">
                            <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                <span>3-letter</span><span id="count-3">0/0</span>
                            </div>
                            <div class="w-full bg-slate-200 rounded-full h-2"><div id="progress-3" class="bg-green-500 h-2 rounded-full" style="width: 0%"></div></div>
                        </div>
                        <div class="mb-4">
                            <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                <span>4-letter</span><span id="count-4">0/0</span>
                            </div>
                            <div class="w-full bg-slate-200 rounded-full h-2"><div id="progress-4" class="bg-green-500 h-2 rounded-full" style="width: 0%"></div></div>
                        </div>
                        <div class="mb-4">
                            <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                <span>5-letter</span><span id="count-5">0/0</span>
                            </div>
                            <div class="w-full bg-slate-200 rounded-full h-2"><div id="progress-5" class="bg-green-500 h-2 rounded-full" style="width: 0%"></div></div>
                        </div>
                        <div class="mb-4">
                            <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                <span>6-letter</span><span id="count-6">0/0</span>
                            </div>
                            <div class="w-full bg-slate-200 rounded-full h-2"><div id="progress-6" class="bg-green-500 h-2 rounded-full" style="width: 0%"></div></div>
                        </div>
                    </div>
                    <div id="progress-7-container" class="hidden">
                        <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>7-letter</span><span id="count-7">0/0</span>
                        </div>
                        <div class="w-full bg-slate-200 rounded-full h-2"><div id="progress-7" class="bg-green-500 h-2 rounded-full" style="width: 0%"></div></div>
                    </div>
                </div>
            </div>

            <div class="relative z-10">
                <canvas id="daily-line-canvas"></canvas>
                <div id="daily-grid" class="grid grid-cols-4 gap-2 select-none"></div>
            </div>
        </div>
    `;

    const accordionTrigger = dailyChallengeContentEl.querySelector('#accordion-trigger');
    const accordionContent = dailyChallengeContentEl.querySelector('#accordion-content');
    const accordionArrow = dailyChallengeContentEl.querySelector('#accordion-arrow');
    const collapsedView = dailyChallengeContentEl.querySelector('#collapsed-view');
    const expandedView = dailyChallengeContentEl.querySelector('#expanded-view');
    const doneButton = dailyChallengeContentEl.querySelector('#done-button');

    if(accordionTrigger) {
        accordionTrigger.addEventListener('click', () => {
            accordionContent.classList.toggle('hidden');
            accordionArrow.classList.toggle('rotate-180');
            collapsedView.classList.toggle('hidden');
            expandedView.classList.toggle('hidden');
        });
    }

    if (doneButton) {
        doneButton.addEventListener('click', showSubmitConfirmation);
    }

    activeGridEl = dailyChallengeContentEl.querySelector('#daily-grid');
    activeCanvasEl = dailyChallengeContentEl.querySelector('#daily-line-canvas');
    activeCtx = activeCanvasEl.getContext('2d');
    if (activeCanvasEl) {
        activeCanvasEl.style.position = 'absolute';
        activeCanvasEl.style.top = '0';
        activeCanvasEl.style.left = '0';
        activeCanvasEl.style.pointerEvents = 'none';
        activeCanvasEl.style.zIndex = '10';
    }
    createGrid(challengeData.board, activeGridEl, challengeData.bonuses);
    attachGridListeners(activeGridEl); 
    updateDailyChallengeUI(); 
}

    let isEndingGame = false;  // Add guard flag
    function endGame() {
        if (isEndingGame) return;  // Prevent multiple calls
        isEndingGame = true;
        
        clearInterval(timerInterval);
        grid.style.pointerEvents = 'none';
        menuContainer.classList.add('hidden');
        
        // ✅ FIX: No delay needed. Show the end screen immediately.
        showEndGameScreen();

       //GOOGLE ANALYTICS -- if (analytics) {
       // logEvent(analytics, 'game_end', {
       //     game_mode: isPracticeMode ? 'practice' : 'timed',
       //     final_score: score,
       //     words_found_count: foundWords.length,
       //     time_taken_seconds: isPracticeMode ? practiceTimeElapsed : GAME_TIME
      //  });
  //  }
        
        if (!isPracticeMode && db && userId) {
            processEndOfGame(score, foundWords, userId);
    }
}

function replaceSelectedTiles() {
    // ✅ FIX: Get the word that was just found so we can avoid re-creating it.
    const foundWordString = selectedTiles.map(t => t.dataset.letter).join('');

    let currentBoardLetters = Array.from(grid.children).map(t => t.dataset.letter);
    selectedTiles.forEach(tile => {
        const index = parseInt(tile.dataset.id);
        currentBoardLetters[index] = null;
    });

    // ✅ FIX: Pass the found word to the generator.
    const newBoard = generateAndValidateBoard(currentBoardLetters, isBoardPlayable, foundWordString);
    
    selectedTiles.forEach((tile) => {
        const index = parseInt(tile.dataset.id);
        const letter = newBoard[index];
        const points = letterConfig[letter].p;

        tile.dataset.bonus = '';
        tile.classList.remove('bonus-DL', 'bonus-TL', 'bonus-DW', 'bonus-Time');
        tile.style.transform = 'scale(0)';

        setTimeout(() => {
            tile.dataset.letter = letter;
            tile.dataset.points = points;
            tile.innerHTML = `<span>${letter}<sub class="text-xs font-semibold ml-1">${points}</sub></span>`;

            const bonusType = getBonusType();
            if (bonusType) {
                tile.dataset.bonus = bonusType.type;
                tile.classList.add(bonusType.class);
                tile.innerHTML += `<div class="bonus-label">${bonusType.label}</div>`;
            }

            tile.style.transform = 'scale(1)';
        }, 200);
    });
}
    
    function handleInteraction(tile) {
    if (!tile || !isMouseDown) return;
    
    const lastSelected = selectedTiles[selectedTiles.length - 1];

    if (selectedTiles.length > 1 && tile === selectedTiles[selectedTiles.length - 2]) {
        const lastTile = selectedTiles.pop();
        lastTile.classList.remove('selected');
    } else if (!selectedTiles.includes(tile) && (!lastSelected || isAdjacent(tile, lastSelected))) {
        selectedTiles.push(tile);
        tile.classList.add('selected');
    }

    updateCurrentWord();
    drawLines();
}
    
    function isAdjacent(t1, t2) {
        if (!t1 || !t2) return false;
        const id1 = parseInt(t1.dataset.id), id2 = parseInt(t2.dataset.id);
        const [c1, r1] = [id1 % GRID_COLS, Math.floor(id1 / GRID_COLS)];
        const [c2, r2] = [id2 % GRID_COLS, Math.floor(id2 / GRID_COLS)];
        return Math.abs(c1 - c2) <= 1 && Math.abs(r1 - r2) <= 1;
    }

  function submitWord() {
    const word = selectedTiles.map(t => t.dataset.letter).join('');
    
    // --- Daily Challenge Logic ---
    if (currentGamemode === 'daily') {
        const startTile = selectedTiles.length > 0 ? selectedTiles[0] : null;

        if (word.length < 3) {
            clearSelection();
            return;
        }
        if (!allDailyWords.has(word)) {
            showGameMessage("Not a valid word", "error", startTile);
            clearSelection();
            return;
        }
        if (foundWords.some(fw => fw.word === word)) {
            showGameMessage("Already Found!", "info", startTile);
            clearSelection();
            return;
        }
        
        let baseScore = 0;
        let wordMultiplier = 1;
        selectedTiles.forEach(tile => {
            let letterScore = parseInt(tile.dataset.points);
            switch (tile.dataset.bonus) {
                case 'DL': letterScore *= 2; break;
                case 'TL': letterScore *= 3; break;
                case 'DW': wordMultiplier *= 2; break;
            }
            baseScore += letterScore;
        });
        let finalScore = baseScore * wordMultiplier;
        if (word.length >= 7) finalScore += 40;
        else if (word.length === 6) finalScore += 20;
        else if (word.length === 5) finalScore += 10;
        else if (word.length === 4) finalScore += 5;

        foundWords.push({ word, score: finalScore, length: word.length });
        score += finalScore;
        
        updateDailyChallengeUI(); 
        
        saveDailyProgress();
        
        createFlyingScore(finalScore, selectedTiles[0]);
        triggerConfetti(selectedTiles);

    } else { // --- Standard & Practice Mode Logic ---
        if (word.length >= 3 && fullDictionaryTrie.search(word)) {
            let baseScore = 0; let wordMultiplier = 1; let timeBonus = 0;
            selectedTiles.forEach(tile => {
                let letterScore = parseInt(tile.dataset.points);
                switch(tile.dataset.bonus) {
                    case 'DL': letterScore *= 2; break; case 'TL': letterScore *= 3; break;
                    case 'DW': wordMultiplier *= 2; break; case 'Time': timeBonus += 5; break;
                }
                baseScore += letterScore;
            });

            let finalScore = baseScore * wordMultiplier;
            if (word.length >= 7) finalScore += 40;
            else if (word.length === 6) finalScore += 20;
            else if (word.length === 5) finalScore += 10;
            else if (word.length === 4) finalScore += 5;
            
            // GOOGLE ANALYTICS             if (analytics) { logEvent(analytics, 'submit_word', { word_length: word.length, score: finalScore, game_mode: isPracticeMode ? 'practice' : 'timed' }); }

            if (timeBonus > 0 && !isPracticeMode) { timer += timeBonus; updateTimerUI(); }

            foundWords.push({ word, score: finalScore, length: word.length });
            createFlyingScore(finalScore, selectedTiles[0]);
            triggerConfetti(selectedTiles);
             score += finalScore;
            updateScoreDisplay();
            replaceSelectedTiles();
        }
    }
    
    clearSelection();
}

function updateDailyChallengeUI() {
    const dailyContent = document.getElementById('daily-challenge-content');
    if (!dailyContent || !allDailyWords) return;

    // --- References to UI elements ---
    const scoreEl = dailyContent.querySelector('#daily-score');
    const wordsEl = dailyContent.querySelector('#daily-word-count');
    const progressBar = dailyContent.querySelector('#daily-progress-bar');
    const summaryTextEl = dailyContent.querySelector('#accordion-summary-text'); 
    const instructionText = dailyContent.querySelector('#instruction-text');
    const lastFoundView = dailyContent.querySelector('#last-found-view');
    const recentWordsEl = dailyContent.querySelector('#recent-words-display'); 
    const collapsedView = dailyContent.querySelector('#collapsed-view');

    // --- Update main scoreboard ---
    if (scoreEl) scoreEl.textContent = score;
    if (wordsEl) wordsEl.textContent = `${foundWords.length} / ${allDailyWords.size}`;
    if (progressBar) {
        const progressPercent = allDailyWords.size > 0 ? (foundWords.length / allDailyWords.size) * 100 : 0;
        progressBar.style.width = `${progressPercent}%`;
    }

    // --- Update accordion trigger bar ---
    if (collapsedView) {
        collapsedView.style.minHeight = '24px';
    }
    if (foundWords.length > 0) {
        if (instructionText) instructionText.classList.add('hidden');
        if (lastFoundView) lastFoundView.classList.remove('hidden');
    } else {
        if (instructionText) instructionText.classList.remove('hidden');
        if (lastFoundView) lastFoundView.classList.add('hidden');
    }
    if(summaryTextEl) {
        const remaining = allDailyWords.size - foundWords.length;
        summaryTextEl.textContent = `You have ${remaining} words remaining!`;
    }
    
    if(recentWordsEl && lastFoundView) {
        const recent = [...foundWords].slice(-5).reverse();
        const container = recentWordsEl;
        container.innerHTML = '';

        lastFoundView.style.visibility = 'hidden';
        lastFoundView.classList.remove('hidden');

        for (const fw of recent) {
            const wordSpan = document.createElement('span');
            wordSpan.className = "bg-blue-100 text-blue-700 font-semibold text-xs px-2 py-0.5 rounded-md";
            wordSpan.textContent = fw.word.toUpperCase();
            container.appendChild(wordSpan);

            if (container.scrollWidth > container.clientWidth && container.clientWidth > 0) {
                wordSpan.remove();
                break;
            }
        }
        lastFoundView.style.visibility = 'visible';
        if (foundWords.length === 0) {
            lastFoundView.classList.add('hidden');
        }
    }
    
    // --- Update the accordion dropdown content ---
    const totalWordsByLength = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    allDailyWords.forEach(word => {
        const len = word.length;
        if (len >= 3 && len <= 7) totalWordsByLength[len]++;
    });

    const foundWordsByLength = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    foundWords.forEach(fw => {
        const len = fw.word.length;
        if (len >= 3 && len <= 7) foundWordsByLength[len]++;
    });

    for (let len = 3; len <= 7; len++) {
        const countEl = dailyContent.querySelector(`#count-${len}`);
        const progressEl = dailyContent.querySelector(`#progress-${len}`);
        if (!countEl || !progressEl) continue;
        const foundCount = foundWordsByLength[len];
        const totalCount = totalWordsByLength[len];
        countEl.textContent = `${foundCount}/${totalCount}`;
        
        // ✅ FIX: If the total count is 0, make the bar 100% full (green).
        const percentage = totalCount > 0 ? (foundCount / totalCount) * 100 : 100;
        progressEl.style.width = `${percentage}%`;
    }
    
    const progress7Container = dailyContent.querySelector('#progress-7-container');
    if (progress7Container) {
        progress7Container.classList.toggle('hidden', totalWordsByLength[7] === 0);
    }

    const listEl = dailyContent.querySelector('#daily-found-words-list');
    if (listEl) {
        const sortedWords = [...foundWords].map(fw => fw.word).sort((a, b) => a.localeCompare(b));
        if (sortedWords.length > 0) {
            listEl.innerHTML = sortedWords.map(word => `<span class="bg-blue-100 text-blue-800 font-semibold text-xs px-2 py-0.5 rounded-md">${word.toUpperCase()}</span>`).join('');
        } else {
            listEl.innerHTML = `<p class="w-full text-center text-sm text-slate-400">You haven't found any words yet!</p>`;
        }
    }
}

async function endDailyChallenge() {
    if (activeGridEl) {
        activeGridEl.style.pointerEvents = 'none';
    }

    showDailyEndScreen({
        score: score,
        foundWords: foundWords,
        totalCount: allDailyWords.size,
    });
}

async function submitDailyScoreToLeaderboard(finalScore) {
    if (!db || !userId) {
        console.warn("Firebase not ready, can't submit daily score.");
        return;
    }
    const playerName = localStorage.getItem('wordRushPlayerName') || 'Player';

    const todayStr = new Date().toLocaleDateString('en-CA');
    const leaderboardRef = doc(db, "leaderboards", "dailyChallenge");

    const newScore = {
        userID: userId,
        name: playerName,
        score: finalScore,
        wordsFound: foundWords.length,
        totalWords: allDailyWords.size
    };

    try {
        await runTransaction(db, async (transaction) => {
            const leaderboardDoc = await transaction.get(leaderboardRef);
            
            // ✅ FIX: This logic is now simpler. It assumes the board has been reset by the server.
            const currentScores = leaderboardDoc.exists() ? leaderboardDoc.data().topScores : [];
            
            const filteredScores = currentScores.filter(s => s.userID !== userId);
            filteredScores.push(newScore);
            
            const newTopScores = filteredScores
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);
            
            transaction.set(leaderboardRef, { topScores: newTopScores, date: todayStr });
        });
        console.log("Daily score submitted successfully!");
    } catch (error) {
        console.error("Error submitting daily score:", error);
    }
}

function saveDailyProgress() {
    // This function is now synchronous and only saves to local storage.
    if (currentGamemode !== 'daily') return;
    try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const progress = {
            score: score,
            foundWords: foundWords
        };
        localStorage.setItem(`dailyProgress-${todayStr}`, JSON.stringify(progress));
    } catch (e) {
        console.error("Error saving progress to Local Storage:", e);
    }
}

// ✅ ADD THIS ENTIRE NEW FUNCTION
function getTileFromEvent(e) {
    if (!tilePositions.length) return null;
    const x = e.clientX;
    const y = e.clientY;

    for (const tilePos of tilePositions) {
        const dx = x - tilePos.center.x;
        const dy = y - tilePos.center.y;
        if (Math.sqrt(dx * dx + dy * dy) < tilePos.hitRadius) {
            return tilePos.el;
        }
    }
    return null;
}
    
    function clearSelection() { selectedTiles.forEach(t => t.classList.remove('selected')); selectedTiles = []; updateCurrentWord(); drawLines(); }
    
 async function processEndOfGame(finalScore, words, uId) {
    if (!db || !uId || isPracticeMode) return;

    const playerDocRef = doc(db, "players", uId);
    
    // --- PART 1: GET PLAYER NAME IF NEEDED ---
    let finalPlayerName = localStorage.getItem('wordRushPlayerName') || 'Anonymous';
    let needsToSubmitName = finalPlayerName === 'Anonymous';

    if (needsToSubmitName) {
        try {
            const playerDocSnap = await getDoc(playerDocRef);
            if (playerDocSnap.exists() && playerDocSnap.data().hasSubmittedName) {
                needsToSubmitName = false;
                finalPlayerName = playerDocSnap.data().name;
            }
        } catch (e) {
            console.error("Could not check for player name:", e);
        }
    }

    let skipLeaderboard = false;
    if (needsToSubmitName) {
        const submissionContainer = document.getElementById('submission-container');
        submissionContainer.innerHTML = `
            <div class="w-full py-1">
                <div class="flex gap-2">
                    <input id="endgame-name-input" type="text" maxlength="10" placeholder="Enter your name"
                        class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-400">
                    <button id="endgame-name-submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Submit</button>
                </div>
                <button id="endgame-create-account" class="text-xs text-green-500 hover:text-green-600 hover:underline mt-2 flex items-center py-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 flex-shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>Sign up to save stats across devices</button>
            </div>`;

        const enteredName = await new Promise(resolve => {
            const doSubmit = () => {
                const name = (document.getElementById('endgame-name-input').value || '').trim().slice(0, 10);
                if (name) resolve(name);
            };
            // Resolve automatically if the user completes sign-up via the account modal
            const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
                if (user && !user.isAnonymous) {
                    unsubscribeAuth();
                    resolve(localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player');
                }
            });
            document.getElementById('endgame-name-submit').onclick = doSubmit;
            document.getElementById('endgame-name-input').onkeydown = (e) => { if (e.key === 'Enter') doSubmit(); };
            document.getElementById('endgame-create-account').onclick = () => showAccountModal();
        });

        if (!enteredName) {
            skipLeaderboard = true;
            submissionContainer.innerHTML = '';
        } else {
            finalPlayerName = enteredName;
            localStorage.setItem('wordRushPlayerName', finalPlayerName);
        }
    }
    
    // --- PART 2: UPDATE ALL DATABASE STATS ---
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    let updatedStats, didBeatDailyHighScore;

    try {
        // First, get the current player data
        const playerDoc = await getDoc(playerDocRef);
        const oldData = playerDoc.exists() ? playerDoc.data() : {};
        const gameBestWord = words.length > 0 ? words.reduce((best, current) => current.score > best.score ? current : best, { score: 0, word: '' }) : { score: 0, word: '' };
        
        // Calculate streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        // Prepare the update data
        const updateData = {
            highScore: Math.max(finalScore, (oldData.highScore || 0)),
            bestWord: gameBestWord.score > (oldData.bestWord?.score || 0) ? gameBestWord : (oldData.bestWord || { word: '', score: 0 }),
            totalGamesPlayed: (oldData.totalGamesPlayed || 0) + 1,
            totalPoints: (oldData.totalPoints || 0) + finalScore,
            totalWordsFound: (oldData.totalWordsFound || 0) + words.length,
            totalLettersFound: (oldData.totalLettersFound || 0) + words.reduce((sum, w) => sum + w.length, 0),
            lastPlayed: serverTimestamp(),
            lastPlayDate: todayStr,
            playStreak: (oldData.lastPlayDate === yesterdayStr) ? (oldData.playStreak || 0) + 1 : (oldData.lastPlayDate === todayStr ? (oldData.playStreak || 1) : 1),
            dailyHighScore: (oldData.dailyHighScoreLastUpdated !== todayStr || finalScore > (oldData.dailyHighScore || 0)) ? finalScore : oldData.dailyHighScore,
            dailyHighScoreLastUpdated: todayStr,
            top5Scores: [...(oldData.top5Scores || []), { score: finalScore, date: todayStr }].sort((a,b)=>b.score-a.score).slice(0,5),
            top5LongestWords: [...new Map([...(oldData.top5LongestWords || []), ...words.map(w=>({word:w.word,length:w.length}))].map(item=>[item.word,item])).values()].sort((a,b)=>b.length-a.length).slice(0,5),
            name: finalPlayerName,
            hasSubmittedName: true
        };

        // Update the document with merge: true to avoid update time conflicts
        await setDoc(playerDocRef, updateData, { merge: true });
        
        didBeatDailyHighScore = oldData.dailyHighScoreLastUpdated !== todayStr || finalScore > (oldData.dailyHighScore || 0);
        updatedStats = { ...oldData, ...updateData };
    } catch (e) {
        console.error("Failed to update player stats:", e);
        updatedStats = {};
        didBeatDailyHighScore = false;
    }

    // Save game history
    try {
        const gameData = { score: finalScore, timestamp: serverTimestamp(), words: words.map(w => ({ word: w.word, score: w.score, length: w.length })) };
        await addDoc(collection(db, `players/${uId}/games`), gameData);
    } catch (e) { 
        console.error("Failed to save game history:", e); 
    }

    let dailyRank = null;
    if (!skipLeaderboard && userId && finalPlayerName !== 'Anonymous') {
        const dailyRef = doc(db, "leaderboards", "daily");
        try {
            // Get current leaderboard data
            const leaderboardDoc = await getDoc(dailyRef);
            let data = leaderboardDoc.exists() ? leaderboardDoc.data() : {};

            // Always initialize arrays if missing
            data.topByHighScore = Array.isArray(data.topByHighScore) ? data.topByHighScore : [];
            data.topByTotalScore = Array.isArray(data.topByTotalScore) ? data.topByTotalScore : [];
            data.topByBestWord = Array.isArray(data.topByBestWord) ? data.topByBestWord : [];

            const oldTotalEntry = data.topByTotalScore.find(e => e.userID === uId);
            const newTotalScore = (oldTotalEntry?.dailyTotalScore || 0) + finalScore;
            const gameBestWord = words.length > 0 ? words.reduce((best, current) => current.score > best.score ? current : best, { score: 0, word: '' }) : { score: 0, word: '' };
            const oldBestWordEntry = data.topByBestWord.find(e => e.userID === uId);
            const newBestWord = gameBestWord.score > (oldBestWordEntry?.dailyBestWord?.score || 0) ? gameBestWord : (oldBestWordEntry?.dailyBestWord || gameBestWord);

            // Update leaderboard lists
            data.date = todayStr;  // Always update the date
            data.topByHighScore = updateLeaderboardList(data.topByHighScore, { userID: uId, name: finalPlayerName, dailyHighScore: updatedStats.dailyHighScore }, 'dailyHighScore');
            data.topByTotalScore = updateLeaderboardList(data.topByTotalScore, { userID: uId, name: finalPlayerName, dailyTotalScore: newTotalScore }, 'dailyTotalScore');
            data.topByBestWord = updateLeaderboardList(data.topByBestWord, { userID: uId, name: finalPlayerName, dailyBestWord: newBestWord }, 'dailyBestWord', 'score');

            // Update with merge
            await setDoc(dailyRef, data, { merge: true });

            const updatedLeaderboardDoc = await getDoc(dailyRef);
            if (updatedLeaderboardDoc.exists()) {
                const rankIndex = (updatedLeaderboardDoc.data().topByHighScore || []).findIndex(p => p.userID === uId);
                if (rankIndex !== -1) dailyRank = rankIndex + 1;
            }
        } catch (e) { console.error("Failed to update daily leaderboard:", e); }

        const allTimeRef = doc(db, "leaderboards", "allTime");
        try {
            // Get current all-time data
            const allTimeDoc = await getDoc(allTimeRef);
            let data = allTimeDoc.exists() ? allTimeDoc.data() : {};

            // Initialize arrays if missing
            data.topByHighScore = Array.isArray(data.topByHighScore) ? data.topByHighScore : [];
            data.topByTotalPoints = Array.isArray(data.topByTotalPoints) ? data.topByTotalPoints : [];
            data.topByBestWord = Array.isArray(data.topByBestWord) ? data.topByBestWord : [];

            // Update leaderboard lists
            data.topByHighScore = updateLeaderboardList(data.topByHighScore, { userID: uId, name: finalPlayerName, score: updatedStats.highScore }, 'score');
            data.topByTotalPoints = updateLeaderboardList(data.topByTotalPoints, { userID: uId, name: finalPlayerName, totalPoints: updatedStats.totalPoints }, 'totalPoints');
            data.topByBestWord = updateLeaderboardList(data.topByBestWord, { userID: uId, name: finalPlayerName, bestWord: updatedStats.bestWord }, 'bestWord', 'score');

            // Update with merge
            await setDoc(allTimeRef, data, { merge: true });
        } catch (e) { console.error("Failed to update all-time leaderboard:", e); }
    }

    updateEndGameSubmissionUI(finalPlayerName, { didBeatDailyHighScore, rank: dailyRank });
}
    
    function updateScoreDisplay() {
        scoreEl.textContent = score;
        scoreEl.classList.add('animate-pulse');
        scoreEl.addEventListener('animationend', () => scoreEl.classList.remove('animate-pulse'), { once: true });
        if (!isPracticeMode) {
            const highScoreEl = document.getElementById('high-score');
            const currentHighScore = parseInt(highScoreEl.textContent) || 0;
            if (score > currentHighScore) { 
                highScoreEl.textContent = score; 
                highScoreEl.classList.add('text-yellow-500', 'animate-pulse');
            }
        } else {
            updatePracticeUI();
        }
    }

    function updateTimerUI() {
    timerEl.textContent = timer;
    timerEl.classList.remove('text-green-500', 'text-yellow-500', 'text-red-500', 'timer-warning');

    if (timer <= 10) {
        timerEl.classList.add('text-red-500', 'timer-warning');
    } else if (timer <= 30) {
        timerEl.classList.add('text-yellow-500');
    } else {
        timerEl.classList.add('text-green-500');
    }
}
    
    function updatePracticeUI() {
        const minutes = Math.floor(practiceTimeElapsed / 60);
        const seconds = practiceTimeElapsed % 60;
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        timerEl.classList.remove('text-yellow-500', 'text-red-500', 'animate-pulse', 'timer-warning');

        timerEl.classList.add('text-green-500');
        
        const pace = Math.round((score / Math.max(1, practiceTimeElapsed)) * 60);
        const paceScoreEl = document.getElementById('pace-score');
        if (paceScoreEl) {
            paceScoreEl.textContent = isNaN(pace) ? 0 : pace;
        }
    }

function triggerConfetti(tiles) {
    tiles.forEach(tile => {
        const rect = tile.getBoundingClientRect();
        for (let i = 0; i < 10; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const angle = Math.random() * Math.PI * 2,
                dist = Math.random() * 40 + 20;
            p.style.setProperty('--transform-end', `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`);
            p.style.left = `${rect.left+rect.width/2-4}px`;
            p.style.top = `${rect.top+rect.height/2-4}px`;
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 1200);
        }
    });
}

   function triggerEndGameConfetti(originEl) {
    // ✅ FIX: If no specific element is provided, do nothing.
    // This prevents accidental, un-centered confetti.
    if (!originEl) return;

    const rect = originEl.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 120 + 50; 
        p.style.setProperty('--transform-end', `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`);
        p.style.left = `${originX - 4}px`;
        p.style.top = `${originY - 4}px`;
        const colors = ['#facc15', '#f59e0b', '#60a5fa', '#3b82f6', '#22c55e'];
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
}
    
   function createFlyingScore(points, startTile) {
    const scale = 1; // All popups are now the same size
    let vibrationIntensity = 0;
    let colorGradient = 'linear-gradient(45deg, #facc15, #f59e0b)'; // Default yellow for scores <= 10

    // Set vibration and redness based on score tier
    if (points > 100) {
        vibrationIntensity = 5;
        colorGradient = 'linear-gradient(45deg, #b91c1c, #7f1d1d)'; // Darkest "full" red
    } else if (points > 50) {
        vibrationIntensity = 3.5;
        colorGradient = 'linear-gradient(45deg, #dc2626, #b91c1c)'; // Darker red
    } else if (points > 30) {
        vibrationIntensity = 2.5;
        colorGradient = 'linear-gradient(45deg, #ef4444, #dc2626)'; // Medium red
    } else if (points > 10) {
        vibrationIntensity = 1.5;
        colorGradient = 'linear-gradient(45deg, #fca5a5, #ef4444)'; // Light red
    }

    const rect = startTile.getBoundingClientRect();

    // 1. Create the outer wrapper that will fly up
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = `${rect.left}px`;
    wrapper.style.top = `${rect.top}px`;
    wrapper.style.zIndex = '100';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.animation = 'fly-to-score 1.5s ease-in-out forwards';

    // 2. Create the inner score element that will vibrate
    const el = document.createElement('div');
    el.className = 'flying-score';
    el.style.animation = 'none';
    el.textContent = `+${points}`;
    el.style.position = 'static';
    el.style.transform = `scale(${scale})`; // Apply the standard scale
    el.style.background = colorGradient; // Apply the tiered color

    // 3. Append and start the animation
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);

    // If vibration is needed, start the vibration loop on the inner element
    if (vibrationIntensity > 0) {
        let animationFrameId;
        const vibrate = () => {
            const x = (Math.random() - 0.5) * vibrationIntensity;
            const y = (Math.random() - 0.5) * vibrationIntensity;
            el.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
            animationFrameId = requestAnimationFrame(vibrate);
        };
        vibrate();
        setTimeout(() => cancelAnimationFrame(animationFrameId), 1300);
    }

    // Remove the entire wrapper after the animation is complete
    setTimeout(() => wrapper.remove(), 1500);
}

function updateCurrentWord() {
    const hasLetters = selectedTiles.length > 0;
    const newWordHTML = selectedTiles.map(t => `<span class="current-letter bg-white text-blue-500 font-bold text-xl p-1 rounded-md shadow-sm">${t.dataset.letter}</span>`).join('');

    if (currentWordLettersEl.innerHTML !== newWordHTML) {
        currentWordLettersEl.innerHTML = newWordHTML;
    }

}

function updateLeaderboardList(list, newEntry, sortKey, nestedKey = null) {
    const filteredList = list.filter(item => item.userID !== newEntry.userID);
    const newList = [...filteredList, newEntry];
    newList.sort((a, b) => {
        const valA = nestedKey ? (a[sortKey] || {})[nestedKey] || 0 : a[sortKey] || 0;
        const valB = nestedKey ? (b[sortKey] || {})[nestedKey] || 0 : b[sortKey] || 0;
        return valB - valA;
    });
    return newList.slice(0, 10);
}

   function showWelcomeScreen() {
    modalContent.innerHTML = `
        <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
            <div class="flex items-center justify-between mb-1">
                <div class="w-8 h-8"></div>
                <h1 class="flex items-center text-3xl font-black text-slate-800 tracking-tighter">
                    <img src="assets/word-worm-logo-icon.webp" alt="Word Worm Logo" class="w-9 h-9 mr-2" width="36" height="36">
                    <span>Word Worm</span>
                </h1>
                <button id="settings-gear-btn" class="p-1 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd" /></svg>
                </button>
            </div>
            <p class="text-slate-500 text-sm mb-3">The fast-paced word finding game!</p>

<div id="how-to-play-container" class="bg-slate-100 p-3 rounded-lg flex flex-col w-full"></div>

     <div class="flex items-center gap-3 mt-4">
    <button id="play-daily-button" class="bg-blue-500 hover:bg-blue-600 flex-1 text-white font-bold h-12 px-2 rounded-lg text-sm flex items-center justify-center transition-transform hover:scale-105">
        <div class="flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
            <span>Daily Challenge</span>
        </div>
    </button>
    <button id="play-game-mode-button" class="bg-green-500 hover:bg-green-600 flex-1 text-white font-bold h-12 px-2 rounded-lg text-base flex items-center justify-center transition-transform hover:scale-105">
        <div class="flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg>
            <span>Play</span>
        </div>
    </button>
</div>
            
            <div class="bg-slate-100 rounded-xl p-2 mt-4">
                <div class="grid grid-cols-3 gap-1 text-center">
                    <div class="bg-white rounded-lg shadow-sm p-1 flex flex-col items-center justify-center">
                        <div class="h-7 flex items-center justify-center">
                            <span id="welcome-high-score" class="text-xl font-black text-purple-600">0</span>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your High</div>
                    </div>

                    <div class="bg-white rounded-lg shadow-sm p-1 flex flex-col items-center justify-center">
                        <div class="h-7 flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" style="color:#f97316;"><path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clip-rule="evenodd" /></svg>
                            <span id="welcome-streak" class="text-xl font-black" style="color:#f97316;">0</span>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Day Streak</div>
                    </div>

                    <a href="#" id="welcome-leaderboard-button" class="bg-white rounded-lg shadow-sm p-1 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors">
                        <div class="h-7 flex items-center justify-center text-green-500">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="m6.115 5.19.319 1.913A6 6 0 0 0 8.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 0 0 2.288-4.042 1.087 1.087 0 0 0-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 0 1-.98-.314l-.295-.295a1.125 1.125 0 0 1 0-1.591l.13-.132a1.125 1.125 0 0 1 1.3-.21l.603.302a.809.809 0 0 0 1.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 0 0 1.528-1.732l.146-.292M6.115 5.19A9 9 0 1 0 17.18 4.64M6.115 5.19A8.965 8.965 0 0 1 12 3c1.929 0 3.716.607 5.18 1.64" /></svg>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Leaderboard</div>
                    </a>
                </div>
                <div class="border-t border-slate-200 mt-2 pt-2">
                    <p id="player-greeting" class="text-xs text-slate-600 font-medium"></p>
                </div>
            </div>

            <div class="text-center text-xs text-slate-400 mt-4">
  <p>&copy; 2026 Word Worm</p>
  <p>
    <a href="/about.html" class="hover:underline">About</a> &bull;
    <a href="/contact.html" class="hover:underline">Contact</a> &bull;
    <a href="/privacy.html" class="hover:underline">Privacy Policy</a> &bull;
    <a href="/terms.html" class="hover:underline">Terms of Use</a>
  </p>
</div>
        </div>
    `;

    menuContainer.classList.add('hidden');
    messageModal.classList.remove('hidden');
    
    document.getElementById('welcome-leaderboard-button').onclick = (e) => {
        e.preventDefault();
        showLeaderboardModal();
    };

    document.getElementById('settings-gear-btn').onclick = () => {
        document.getElementById('settings-modal').classList.remove('hidden');
    };
    document.getElementById('close-settings-modal').onclick = () => {
        document.getElementById('settings-modal').classList.add('hidden');
    };
    document.getElementById('settings-modal-stats').onclick = () => {
        document.getElementById('settings-modal').classList.add('hidden');
        showProfileModal('stats');
    };
    document.getElementById('settings-modal-profile').onclick = () => {
        document.getElementById('settings-modal').classList.add('hidden');
        showProfileModal('profile');
    };
    document.getElementById('settings-modal-how-to-play').onclick = () => {
        document.getElementById('settings-modal').classList.add('hidden');
        showHowToPlayModal();
    };

    setupTutorial();
    menuContainer.classList.add('hidden');
    
    document.getElementById('play-game-mode-button').onclick = () => startGame(false);
    document.getElementById('play-daily-button').onclick = () => startGame(false, 'daily');
}

    function showAccountModal() {
        const accountModal = document.getElementById('account-modal');
        const accountModalContent = document.getElementById('account-modal-content');

        if (isUserSignedIn()) {
            const playerName = localStorage.getItem('wordRushPlayerName') || 'Player';
            const highScore = document.getElementById('welcome-high-score')?.textContent || '0';
            const streak = document.getElementById('welcome-streak')?.textContent || '0';
            accountModalContent.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-slate-800 flex items-center">
                        Your Account
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 ml-2 text-green-500"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clip-rule="evenodd" /></svg>
                    </h2>
                    <button id="close-account-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 mb-4">
                    <p class="text-lg font-black text-slate-800">${playerName}</p>
                    <p class="text-xs text-slate-500 mt-1">High Score: ${highScore} &bull; Streak: ${streak} days</p>
                </div>
                <button id="account-signout-btn" class="w-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base shadow-md transition-colors border border-slate-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2 text-red-400"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                    Sign Out
                </button>`;

            document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
            document.getElementById('account-signout-btn').onclick = async () => {
                await signOut(auth);
                await signInAnonymously(auth);
                localStorage.removeItem('wordRushPlayerName');
                accountModal.classList.add('hidden');
                showWelcomeScreen();
            };
        } else {
            const googleSvg = `<svg class="w-5 h-5 mr-2 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;
            const spinnerHtml = `<svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            const orDivider = `<div class="relative my-4"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div><div class="relative flex justify-center text-xs"><span class="bg-white px-2 text-slate-400">or</span></div></div>`;
            const inputClass = `auth-input w-full px-3 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400`;
            const labelClass = `block text-sm font-bold text-slate-700 mb-1`;

            const viewHeader = (title) => `
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-slate-800">${title}</h2>
                    <button id="close-account-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
                </div>`;

            const renderAuthModal = (activeTab = 'login', errorMsg = '') => {
                if (activeTab === 'login') {
                    accountModalContent.innerHTML = `
                        ${viewHeader('Log In')}
                        ${errorMsg ? `<p class="text-xs text-red-500 mb-3">${errorMsg}</p>` : ''}
                        <div class="space-y-3">
                            <div>
                                <label class="${labelClass}">Email Address</label>
                                <input id="login-email" type="email" class="${inputClass}">
                            </div>
                            <div>
                                <div class="flex justify-between items-center mb-1">
                                    <label class="${labelClass}">Password</label>
                                    <span id="forgot-password-link" class="text-xs text-slate-400 hover:text-slate-600 cursor-pointer hover:underline">Forgot password?</span>
                                </div>
                                <input id="login-password" type="password" class="${inputClass}">
                            </div>
                            <button id="login-submit-btn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">
                                Log In
                            </button>
                        </div>
                        ${orDivider}
                        <button id="login-google-btn" class="w-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-lg text-sm border border-slate-300 transition-colors">
                            ${googleSvg}Continue with Google
                        </button>
                        <p class="text-center mt-4 space-x-3">
                            <span id="goto-signup" class="text-xs text-slate-400 hover:text-slate-600 cursor-pointer hover:underline">Don't have an account? Sign up</span>
                        </p>
                        <p class="text-center mt-2">
                            <span id="login-guest-btn" class="text-xs text-slate-400 hover:text-slate-600 cursor-pointer hover:underline">Continue as Guest</span>
                        </p>`;

                    document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('goto-signup').onclick = () => renderAuthModal('signup');
                    document.getElementById('login-guest-btn').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('forgot-password-link').onclick = () => renderForgotPasswordView();
                    document.getElementById('login-google-btn').onclick = async () => {
                        const btn = document.getElementById('login-google-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Signing in...</div>`;
                        try {
                            await signInWithProvider(new GoogleAuthProvider());
                            accountModal.classList.add('hidden');
                            showWelcomeScreen();
                        } catch (e) {
                            console.error('Google sign-in failed:', e);
                            renderAuthModal('login', 'Sign-in failed. Please try again.');
                        }
                    };
                    document.getElementById('login-submit-btn').onclick = async () => {
                        const email = document.getElementById('login-email').value.trim();
                        const password = document.getElementById('login-password').value;
                        if (!email) { renderAuthModal('login', 'Please enter your email address.'); return; }
                        if (!password) { renderAuthModal('login', 'Please enter your password.'); return; }
                        const btn = document.getElementById('login-submit-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Signing in...</div>`;
                        try {
                            const result = await signInWithEmailAndPassword(auth, email, password);
                            userId = result.user.uid;
                            if (db) {
                                const snap = await getDoc(doc(db, "players", result.user.uid));
                                if (snap.exists() && snap.data().name) localStorage.setItem('wordRushPlayerName', snap.data().name);
                            }
                            accountModal.classList.add('hidden');
                            showWelcomeScreen();
                        } catch (e) {
                            console.error('Email sign-in failed:', e);
                            const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
                                ? 'Incorrect email or password.'
                                : e.code === 'auth/invalid-email' ? 'Please enter a valid email address.'
                                : 'Something went wrong. Please try again.';
                            renderAuthModal('login', msg);
                        }
                    };
                } else {
                    accountModalContent.innerHTML = `
                        ${viewHeader('Sign Up')}
                        ${errorMsg ? `<p class="text-xs text-red-500 mb-3">${errorMsg}</p>` : ''}
                        <div class="space-y-3">
                            <div>
                                <label class="${labelClass}">Display Name</label>
                                <input id="create-name" type="text" placeholder="Shown on leaderboard (max 10 chars)" maxlength="10" class="${inputClass}">
                            </div>
                            <div>
                                <label class="${labelClass}">Email Address</label>
                                <input id="create-email" type="email" class="${inputClass}">
                            </div>
                            <div>
                                <label class="${labelClass}">Password</label>
                                <input id="create-password" type="password" placeholder="Minimum 6 characters" class="${inputClass}">
                            </div>
                            <button id="create-submit-btn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">
                                Create Account
                            </button>
                        </div>
                        ${orDivider}
                        <button id="signup-google-btn" class="w-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-lg text-sm border border-slate-300 transition-colors">
                            ${googleSvg}Continue with Google
                        </button>
                        <p class="text-center mt-4">
                            <span id="goto-login" class="text-xs text-slate-400 hover:text-slate-600 cursor-pointer hover:underline">Already have an account? Log in</span>
                        </p>
                        <p class="text-center mt-2">
                            <span id="signup-guest-btn" class="text-xs text-slate-400 hover:text-slate-600 cursor-pointer hover:underline">Continue as Guest</span>
                        </p>`;

                    document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('goto-login').onclick = () => renderAuthModal('login');
                    document.getElementById('signup-guest-btn').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('signup-google-btn').onclick = async () => {
                        const btn = document.getElementById('signup-google-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Signing in...</div>`;
                        try {
                            await signInWithProvider(new GoogleAuthProvider());
                            accountModal.classList.add('hidden');
                            showWelcomeScreen();
                        } catch (e) {
                            console.error('Google sign-in failed:', e);
                            renderAuthModal('signup', 'Sign-in failed. Please try again.');
                        }
                    };
                    document.getElementById('create-submit-btn').onclick = async () => {
                        const name = document.getElementById('create-name').value.trim();
                        const email = document.getElementById('create-email').value.trim();
                        const password = document.getElementById('create-password').value;
                        if (!name) { renderAuthModal('signup', 'Please enter a display name.'); return; }
                        if (!email) { renderAuthModal('signup', 'Please enter an email address.'); return; }
                        if (password.length < 6) { renderAuthModal('signup', 'Password must be at least 6 characters.'); return; }
                        const btn = document.getElementById('create-submit-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Creating account...</div>`;
                        try {
                            const credential = EmailAuthProvider.credential(email, password);
                            const result = await linkWithCredential(auth.currentUser, credential);
                            userId = result.user.uid;
                            if (db) {
                                await setDoc(doc(db, "players", result.user.uid), { name, hasSubmittedName: true }, { merge: true });
                                localStorage.setItem('wordRushPlayerName', name);
                            }
                            accountModal.classList.add('hidden');
                            showWelcomeScreen();
                        } catch (e) {
                            console.error('Account creation failed:', e);
                            const msg = e.code === 'auth/email-already-in-use' ? 'That email is already in use.'
                                : e.code === 'auth/invalid-email' ? 'Please enter a valid email address.'
                                : 'Something went wrong. Please try again.';
                            renderAuthModal('signup', msg);
                        }
                    };
                }
            };

            const renderForgotPasswordView = (errorMsg = '', successEmail = '') => {
                accountModalContent.innerHTML = successEmail ? `
                    <div class="flex items-center mb-4">
                        <button id="back-to-login" class="text-slate-400 hover:text-slate-600 mr-3 text-sm flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                            Back
                        </button>
                        <button id="close-account-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800 ml-auto">&times;</button>
                    </div>
                    <div class="text-center py-4">
                        <div class="text-4xl mb-3">📬</div>
                        <h2 class="text-lg font-bold text-slate-800 mb-2">Check your email</h2>
                        <p class="text-sm text-slate-500">We sent a password reset link to <strong>${successEmail}</strong>. Check your inbox and follow the link to reset your password.</p>
                    </div>
                    <button id="back-to-login-btn" class="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">Back to Log In</button>` : `
                    <div class="flex items-center mb-4">
                        <button id="back-to-login" class="text-slate-400 hover:text-slate-600 mr-3 text-sm flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                            Back
                        </button>
                        <h2 class="text-lg font-bold text-slate-800">Reset Password</h2>
                        <button id="close-account-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800 ml-auto">&times;</button>
                    </div>
                    <p class="text-xs text-slate-500 mb-4">Enter your email and we'll send you a link to reset your password.</p>
                    ${errorMsg ? `<p class="text-xs text-red-500 mb-3">${errorMsg}</p>` : ''}
                    <div class="space-y-3">
                        <div>
                            <label class="${labelClass}">Email Address</label>
                            <input id="reset-email" type="email" class="${inputClass}">
                        </div>
                        <button id="reset-submit-btn" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">
                            Send Reset Link
                        </button>
                    </div>`;

                document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
                document.getElementById('back-to-login').onclick = () => renderAuthModal('login');
                if (successEmail) {
                    document.getElementById('back-to-login-btn').onclick = () => renderAuthModal('login');
                } else {
                    document.getElementById('reset-submit-btn').onclick = async () => {
                        const email = document.getElementById('reset-email').value.trim();
                        if (!email) { renderForgotPasswordView('Please enter your email address.'); return; }
                        const btn = document.getElementById('reset-submit-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Sending...</div>`;
                        try {
                            await sendPasswordResetEmail(auth, email);
                            renderForgotPasswordView('', email);
                        } catch (e) {
                            console.error('Password reset failed:', e);
                            const msg = e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email'
                                ? 'No account found with that email.'
                                : 'Something went wrong. Please try again.';
                            renderForgotPasswordView(msg);
                        }
                    };
                }
            };

            renderAuthModal('login');
        }

        accountModal.classList.remove('hidden');
    }

   async function showLeaderboardModal(initialTab = 'challenge') {
    leaderboardModal.classList.remove('hidden');
    leaderboardModalContent.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-xs mx-auto modal-enter">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold text-slate-800 flex items-center">
                    Leaderboard 
                    <span class="inline-block w-6 h-6 ml-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="m6.115 5.19.319 1.913A6 6 0 0 0 8.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 0 0 2.288-4.042 1.087 1.087 0 0 0-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 0 1-.98-.314l-.295-.295a1.125 1.125 0 0 1 0-1.591l.13-.132a1.125 1.125 0 0 1 1.3-.21l.603.302a.809.809 0 0 0 1.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 0 0 1.528-1.732l.146-.292M6.115 5.19A9 9 0 1 0 17.18 4.64M6.115 5.19A8.965 8.965 0 0 1 12 3c1.929 0 3.716.607 5.18 1.64" /></svg>
                    </span>
                </h2>
                <button id="close-leaderboard-button" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
            </div>
            <div class="flex p-1 bg-slate-200 rounded-lg mb-4">
                <button id="challenge-tab" class="tab-button flex-1 py-1 px-2 rounded-md font-semibold text-sm transition-colors duration-200">Challenge</button>
                <button id="daily-tab" class="tab-button flex-1 py-1 px-2 rounded-md font-semibold text-sm transition-colors duration-200">Daily</button>
                <button id="all-time-tab" class="tab-button flex-1 py-1 px-2 rounded-md font-semibold text-sm transition-colors duration-200">All-Time</button>
            </div>
            <div id="leaderboard-loading-secondary" class="text-slate-500 p-2">Fetching Scores...</div>
            <div id="leaderboard-scroll-container" class="relative max-h-[20rem] overflow-y-auto">
                <div id="leaderboard-list-simple" class="space-y-2 text-left"></div>
            </div>
        </div>`;

    const challengeTab = document.getElementById('challenge-tab');
    const dailyTab = document.getElementById('daily-tab');
    const allTimeTab = document.getElementById('all-time-tab');
    const listEl = document.getElementById('leaderboard-list-simple');
    const loadingEl = document.getElementById('leaderboard-loading-secondary');
    
    const displayTab = (type) => {
        if (!db) { listEl.innerHTML = `<p class="text-red-500 text-center p-4">Leaderboard is offline.</p>`; if (loadingEl) loadingEl.style.display = 'none'; return; }
        
        challengeTab.classList.remove('active');
        dailyTab.classList.remove('active'); 
        allTimeTab.classList.remove('active');

        // ✅ FIX: Added logic to handle the new 'challenge' type
        if(type === 'challenge') {
            challengeTab.classList.add('active');
            fetchAndDisplayLeaderboard('challenge', listEl, loadingEl);
        } else if(type === 'daily') {
            dailyTab.classList.add('active');
            fetchAndDisplayLeaderboard('daily', listEl, loadingEl);
        } else {
            allTimeTab.classList.add('active');
            fetchAndDisplayLeaderboard('all-time', listEl, loadingEl);
        }
    };

    challengeTab.onclick = () => displayTab('challenge');
    dailyTab.onclick = () => displayTab('daily');
    allTimeTab.onclick = () => displayTab('all-time');
    
    // Display the specified initial tab
    displayTab(initialTab); 
    
    document.getElementById('close-leaderboard-button').onclick = () => { leaderboardModal.classList.add('hidden'); };
}

    async function showProfileModal(defaultTab = 'profile') {
        statsModal.classList.remove('hidden');

        const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
        const googleSvg = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

        const renderModal = async (activeTab) => {
            const user = auth.currentUser;
            const signedIn = isUserSignedIn();

            const title = activeTab === 'stats' ? 'Your Stats' : 'Manage Profile';

            const wrapModal = (body) => `<div class="bg-white rounded-2xl shadow-2xl p-6 modal-enter w-full max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-5">
                    <h2 class="text-2xl font-bold text-slate-800">${title}</h2>
                    <button id="close-profile-btn" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
                </div>
                <div id="profile-tab-content">${body}</div>
            </div>`;

            const attachShared = () => {
                document.getElementById('close-profile-btn').onclick = () => statsModal.classList.add('hidden');
            };

            if (activeTab === 'stats') {
                statsModalContent.innerHTML = wrapModal('<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto"></div></div>');
                attachShared();
                const stats = await fetchAndCalculateStats();
                const contentEl = document.getElementById('profile-tab-content');
                if (contentEl) contentEl.innerHTML = buildStatsContent(stats);
                return;
            }

            let body;
            if (signedIn) {
                const playerName = localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player';
                const isEmailUser = user.providerData?.some(p => p.providerId === 'password');
                const isGoogleUser = user.providerData?.some(p => p.providerId === 'google.com');

                const providerSection = isEmailUser ? `
                    <div class="border-t border-slate-100 pt-2">
                        <button id="change-pw-toggle" class="w-full text-left text-sm font-bold text-slate-700 hover:text-slate-900 flex items-center justify-between">
                            <span>Change Password</span>
                            <svg id="change-pw-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 transition-transform duration-200"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        <div id="change-pw-form" class="hidden mt-3 space-y-2">
                            <input id="current-pw" type="password" placeholder="Current password" class="${inputCls}">
                            <input id="new-pw" type="password" placeholder="New password (min. 6 characters)" class="${inputCls}">
                            <input id="confirm-pw" type="password" placeholder="Confirm new password" class="${inputCls}">
                            <p id="pw-error" class="text-xs text-red-500 hidden"></p>
                            <p id="pw-success" class="text-xs text-green-600 hidden"></p>
                            <button id="update-pw-btn" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">Update Password</button>
                        </div>
                    </div>` : isGoogleUser ? `
                    <div class="border-t border-slate-100 pt-4 flex items-center gap-2">
                        ${googleSvg}
                        <span class="text-xs text-slate-400">Signed in with Google</span>
                    </div>` : '';

                body = `<div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Username</label>
                        <div class="flex gap-2">
                            <input id="profile-username" type="text" value="${playerName.replace(/"/g, '&quot;')}" maxlength="20" class="${inputCls} flex-1">
                            <button id="save-username-btn" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-sm transition-colors whitespace-nowrap">Save</button>
                        </div>
                        <p id="username-msg" class="text-xs mt-1 min-h-[16px]"></p>
                    </div>
                    ${providerSection}
                    <div class="border-t border-slate-100 pt-4">
                        <button id="profile-signout-btn" class="w-full flex items-center justify-center text-red-500 hover:text-red-700 font-semibold py-2.5 px-4 rounded-lg text-sm border border-red-200 hover:border-red-300 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                            Sign Out
                        </button>
                    </div>
                </div>`;
            } else {
                body = `<div class="text-center py-8">
                    <p class="text-slate-500 mb-5 text-sm">Sign in to manage your profile and sync your stats across devices.</p>
                    <button id="profile-signin-btn" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">Sign In / Sign Up</button>
                </div>`;
            }

            statsModalContent.innerHTML = wrapModal(body);
            attachShared();

            if (signedIn) {
                document.getElementById('save-username-btn').onclick = async () => {
                    const newName = document.getElementById('profile-username').value.trim();
                    const msgEl = document.getElementById('username-msg');
                    if (!newName) {
                        msgEl.textContent = 'Name cannot be empty.';
                        msgEl.className = 'text-xs mt-1 text-red-500 min-h-[16px]';
                        return;
                    }
                    try {
                        localStorage.setItem('wordRushPlayerName', newName);
                        await updateProfile(auth.currentUser, { displayName: newName });
                        if (db && userId) {
                            await setDoc(doc(db, 'players', userId), { name: newName, hasSubmittedName: true }, { merge: true });
                        }
                        const greetingEl = document.getElementById('player-greeting');
                        if (greetingEl) greetingEl.innerHTML = `Welcome back, <strong class="font-bold">${newName}</strong>!`;
                        msgEl.textContent = 'Saved!';
                        msgEl.className = 'text-xs mt-1 text-green-600 min-h-[16px]';
                        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
                    } catch (e) {
                        msgEl.textContent = 'Failed to save. Try again.';
                        msgEl.className = 'text-xs mt-1 text-red-500 min-h-[16px]';
                    }
                };

                const toggleBtn = document.getElementById('change-pw-toggle');
                if (toggleBtn) {
                    toggleBtn.onclick = () => {
                        const form = document.getElementById('change-pw-form');
                        const chevron = document.getElementById('change-pw-chevron');
                        const isHidden = form.classList.toggle('hidden');
                        chevron.style.transform = isHidden ? '' : 'rotate(180deg)';
                    };
                    document.getElementById('update-pw-btn').onclick = async () => {
                        const currentPw = document.getElementById('current-pw').value;
                        const newPw = document.getElementById('new-pw').value;
                        const confirmPw = document.getElementById('confirm-pw').value;
                        const errorEl = document.getElementById('pw-error');
                        const successEl = document.getElementById('pw-success');
                        errorEl.classList.add('hidden');
                        successEl.classList.add('hidden');
                        if (!currentPw || !newPw || !confirmPw) {
                            errorEl.textContent = 'Please fill in all fields.';
                            errorEl.classList.remove('hidden');
                            return;
                        }
                        if (newPw.length < 6) {
                            errorEl.textContent = 'New password must be at least 6 characters.';
                            errorEl.classList.remove('hidden');
                            return;
                        }
                        if (newPw !== confirmPw) {
                            errorEl.textContent = 'Passwords do not match.';
                            errorEl.classList.remove('hidden');
                            return;
                        }
                        const btn = document.getElementById('update-pw-btn');
                        btn.disabled = true;
                        btn.textContent = 'Updating...';
                        try {
                            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPw);
                            await reauthenticateWithCredential(auth.currentUser, credential);
                            await updatePassword(auth.currentUser, newPw);
                            successEl.textContent = 'Password updated successfully!';
                            successEl.classList.remove('hidden');
                            document.getElementById('current-pw').value = '';
                            document.getElementById('new-pw').value = '';
                            document.getElementById('confirm-pw').value = '';
                            setTimeout(() => { document.getElementById('change-pw-form')?.classList.add('hidden'); }, 1500);
                        } catch (e) {
                            errorEl.textContent = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
                                ? 'Current password is incorrect.'
                                : 'Failed to update password. Try again.';
                            errorEl.classList.remove('hidden');
                        } finally {
                            btn.disabled = false;
                            btn.textContent = 'Update Password';
                        }
                    };
                }

                document.getElementById('profile-signout-btn').onclick = async () => {
                    await signOut(auth);
                    await signInAnonymously(auth);
                    localStorage.removeItem('wordRushPlayerName');
                    statsModal.classList.add('hidden');
                    showWelcomeScreen();
                };
            } else {
                document.getElementById('profile-signin-btn').onclick = () => {
                    statsModal.classList.add('hidden');
                    showAccountModal();
                };
            }
        };

        await renderModal(defaultTab);
    }

    function buildStatsContent(stats) {
        if (!stats) {
            return `<p class="text-slate-500 text-center py-8">Play a game to see your stats here!</p>`;
        }
        const avgScore = stats.totalGamesPlayed > 0 ? Math.round(stats.totalPoints / stats.totalGamesPlayed) : 0;
        const avgWordLength = stats.totalWordsFound > 0 ? (stats.totalLettersFound / stats.totalWordsFound).toFixed(1) : 0;
        const playStreakIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" /></svg>`;
        const totalPointsIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>`;
        const bestWordIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>`;
        const bestWordDisplay = stats.bestWord.word ? `${stats.bestWord.word.toUpperCase()} (${stats.bestWord.score})` : 'N/A';
        const topScoresHTML = stats.top5Scores.map((s, i) => {
            const dateParts = s.date.split('-');
            const shortDate = `${Number(dateParts[1])}/${Number(dateParts[2])}/${dateParts[0].slice(-2)}`;
            return `<li class="flex justify-between p-1 ${i % 2 === 0 ? 'bg-slate-50' : ''} rounded"><span><strong>${s.score}</strong></span><span class="text-slate-500">${shortDate}</span></li>`;
        }).join('') || '<p class="text-xs text-slate-400 text-center py-1">No scores yet.</p>';
        const topWordsHTML = stats.top5LongestWords.map((w, i) => `<li class="p-1 ${i % 2 === 0 ? 'bg-slate-50' : ''} rounded"><strong>${w.word.toUpperCase()}</strong> (${w.length})</li>`).join('') || '<p class="text-xs text-slate-400 text-center py-1">No words found.</p>';
        return `<div class="space-y-3 text-left mb-4">
            <div class="flex items-center justify-between"><span class="flex items-center font-bold text-slate-600">${playStreakIcon}<span class="ml-2">Play Streak</span></span><span class="font-black text-xl text-amber-500">${stats.playStreak} Day${stats.playStreak !== 1 ? 's' : ''}</span></div>
            <div class="flex items-center justify-between"><span class="flex items-center font-bold text-slate-600">${totalPointsIcon}<span class="ml-2">Total Points</span></span><span class="font-black text-xl text-slate-700">${stats.totalPoints.toLocaleString()}</span></div>
            <div class="flex items-center justify-between"><span class="flex items-center font-bold text-slate-600">${bestWordIcon}<span class="ml-2">Best Word</span></span><span class="font-black text-xl text-slate-700">${bestWordDisplay}</span></div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center bg-slate-100 p-3 rounded-lg mb-4">
            <div><div class="text-xs font-bold text-slate-500 uppercase">Games</div><div class="text-2xl font-black text-slate-800">${stats.totalGamesPlayed}</div></div>
            <div><div class="text-xs font-bold text-slate-500 uppercase">Avg Score</div><div class="text-2xl font-black text-slate-800">${avgScore}</div></div>
            <div><div class="text-xs font-bold text-slate-500 uppercase">Avg Length</div><div class="text-2xl font-black text-slate-800">${avgWordLength}</div></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div><h3 class="text-base font-bold text-slate-700 mb-2 border-b pb-1">Best Scores</h3><ol class="space-y-1">${topScoresHTML}</ol></div>
            <div><h3 class="text-base font-bold text-slate-700 mb-2 border-b pb-1">Longest Words</h3><ol class="space-y-1">${topWordsHTML}</ol></div>
        </div>`;
    }
    
    async function fetchAndCalculateStats() {
        if (!db || !userId) return null;
        const playerDocRef = doc(db, "players", userId);
        const docSnap = await getDoc(playerDocRef); 
        if (!docSnap.exists() || !docSnap.data().totalGamesPlayed) {
            return null;
        }
        const stats = docSnap.data();
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        let finalPlayStreak = stats.playStreak || 0;
        if (stats.lastPlayDate !== todayStr && stats.lastPlayDate !== yesterdayStr) {
            finalPlayStreak = 0;
        }
        return {
            totalGamesPlayed: stats.totalGamesPlayed,
            totalPoints: stats.totalPoints,
            totalWordsFound: stats.totalWordsFound || 0,
            totalLettersFound: stats.totalLettersFound || 0,
            top5Scores: stats.top5Scores || [],
            top5LongestWords: stats.top5LongestWords || [],
            highScore: stats.highScore || 0,
            bestWord: stats.bestWord || { word: '', score: 0 },
            playStreak: finalPlayStreak
        };
    }
    
 async function fetchAndDisplayLeaderboard(type, listElement, loadingElement) {
    if (!listElement) return;
    if (loadingElement) loadingElement.style.display = 'block';
    listElement.innerHTML = '';
    if (!db) {
        listElement.innerHTML = `<p class="text-red-500 text-center p-4">Leaderboard is offline.</p>`;
        if (loadingElement) loadingElement.style.display = 'none';
        return;
    }

    try {
        let html = '';
        const icons = {
            highScore: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" /></svg>',
            totalPoints: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>',
            bestWord: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>'
        };

        if (type === 'challenge') {
            const todayStr = new Date().toLocaleDateString('en-CA');
            const leaderboardRef = doc(db, "leaderboards", "dailyChallenge");
            const docSnap = await getDoc(leaderboardRef);

            if (!docSnap.exists() || docSnap.data().date !== todayStr || !docSnap.data().topScores || docSnap.data().topScores.length === 0) {
                html += `<p class="text-slate-500 text-center text-sm p-2">No scores yet for today's challenge. Be the first!</p>`;
            } else {
                html += `<h3 class="text-lg font-bold text-slate-800 my-2 sticky top-0 bg-white py-1 flex items-center gap-2">${icons.highScore} Score / Words Found</h3>`;
                const players = docSnap.data().topScores;
                const scores = players.map((player, i) => {
                    const isCurrentUser = player.userID === userId;
                    return `
                        <li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}">
                            <span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span>
                            <span class="font-semibold text-slate-800 flex-grow truncate mr-4">${player.name}</span>
                            <div class="text-right">
                                <span class="font-bold text-green-500">${player.score.toLocaleString()} pts</span>
                                <span class="font-medium text-slate-500 text-xs ml-2">(${player.wordsFound}/${player.totalWords})</span>
                            </div>
                        </li>`;
                }).join('');
                html += `<ol class="space-y-1">${scores}</ol>`;
            }
        } else if (type === 'all-time') {
            const leaderboardRef = doc(db, "leaderboards", "allTime");
            const docSnap = await getDoc(leaderboardRef);
            if (!docSnap.exists() || !docSnap.data()) {
                 html = `<p class="text-slate-500 text-center text-sm p-2">All-Time leaderboard is not available.</p>`;
            } else {
                const data = docSnap.data();
                const categories = [
                    { key: 'topByHighScore', title: `${icons.highScore} High Score`, valueKey: 'score' },
                    { key: 'topByTotalPoints', title: `${icons.totalPoints} Total Points`, valueKey: 'totalPoints' },
                    { key: 'topByBestWord', title: `${icons.bestWord} Best Word`, valueKey: 'bestWord', nestedKey: 'score' }
                ];
                for (const cat of categories) {
                    html += `<h3 class="text-lg font-bold text-slate-800 my-2 sticky top-0 bg-white py-1 flex items-center gap-2">${cat.title}</h3>`;
                    const players = data[cat.key] || [];
                    if (players.length === 0) {
                        html += `<p class="text-slate-500 text-center text-sm p-2">No players yet.</p>`;
                    } else {
                        const scores = players.map((player, i) => {
                            const isCurrentUser = player.userID === userId;
                            let value = cat.nestedKey ? (player[cat.valueKey] ? `${player[cat.valueKey].word.toUpperCase()} (${player[cat.valueKey].score})` : 'N/A') : (player[cat.valueKey]?.toLocaleString() || 0);
                            return `<li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}"><span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span><span class="font-semibold text-slate-800 flex-grow truncate mr-4">${player.name}</span><span class="font-bold text-green-500">${value}</span></li>`;
                        }).join('');
                        html += `<ol class="space-y-1">${scores}</ol>`;
                    }
                }
            }
        } else { // ✅ FIX: This is the corrected logic for the timed 'daily' leaderboard
            const leaderboardRef = doc(db, "leaderboards", "daily");
            const docSnap = await getDoc(leaderboardRef);
            if (!docSnap.exists() || !docSnap.data().topByHighScore) { // Check for the new data structure
                html += `<p class="text-slate-500 text-center text-sm p-2">No scores yet today. Be the first!</p>`;
            } else {
                const data = docSnap.data();
                const categories = [
                    { key: 'topByHighScore', title: `${icons.highScore} High Score`, valueKey: 'dailyHighScore' },
                    { key: 'topByTotalScore', title: `${icons.totalPoints} Total Points`, valueKey: 'dailyTotalScore' },
                    { key: 'topByBestWord', title: `${icons.bestWord} Best Word`, valueKey: 'dailyBestWord', nestedKey: 'score' }
                ];
                for (const cat of categories) {
                    html += `<h3 class="text-lg font-bold text-slate-800 my-2 sticky top-0 bg-white py-1 flex items-center gap-2">${cat.title}</h3>`;
                    const players = data[cat.key] || [];
                    if (players.length === 0) {
                        html += `<p class="text-slate-500 text-center text-sm p-2">No players yet.</p>`;
                    } else {
                        const scores = players.map((player, i) => {
                            const isCurrentUser = player.userID === userId;
                            let value = cat.nestedKey ? (player[cat.valueKey] ? `${player[cat.valueKey].word.toUpperCase()} (${player[cat.valueKey].score})` : 'N/A') : (player[cat.valueKey]?.toLocaleString() || 0);
                            return `<li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}"><span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span><span class="font-semibold text-slate-800 flex-grow truncate mr-4">${player.name}</span><span class="font-bold text-green-500">${value}</span></li>`;
                        }).join('');
                        html += `<ol class="space-y-1">${scores}</ol>`;
                    }
                }
            }
        }
        listElement.innerHTML = html;
    } catch (e) {
        console.error(`Could not fetch ${type} leaderboard`, e);
        listElement.innerHTML = `<p class="text-red-500 text-center p-4">Could not load leaderboard.</p>`;
    } finally {
        if (loadingElement) loadingElement.style.display = 'none';
    }
}
    
   // ✅ REPLACE your old function with this
function setupEventListeners() {
    const pauseModal = document.getElementById('pause-modal');
    const resumeButton = document.getElementById('resume-game-button');
    const restartButton = document.getElementById('restart-game-button');
    const quitButton = document.getElementById('quit-game-button');
    const closePauseButton = document.getElementById('close-pause-modal-button');

    const resumeGame = () => {
        pauseModal.classList.add('hidden');
        if (currentGamemode !== 'daily' && timer > 0) {
            if (isPracticeMode) {
                timerInterval = setInterval(() => { practiceTimeElapsed++; updatePracticeUI(); }, 1000);
            } else {
                timerInterval = setInterval(() => { timer--; updateTimerUI(); if (timer <= 0) endGame(); }, 1000);
            }
        }
    };

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('#menu-button')) {
            e.stopPropagation();
            clearInterval(timerInterval);
            
            // ✅ FIX: Hides the 'New Game' button if the mode is 'daily', and shows it otherwise.
            restartButton.classList.toggle('hidden', currentGamemode === 'daily');
            
            pauseModal.classList.remove('hidden');
        }
    });

    resumeButton.addEventListener('click', resumeGame);
    closePauseButton.addEventListener('click', resumeGame);
    restartButton.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        startGame(isPracticeMode, currentGamemode);
    });
    quitButton.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        resetGame();
    });
    pauseModal.addEventListener('click', (e) => {
        if (e.target === pauseModal) { resumeGame(); }
    });
}
    
    function cacheTilePositions(gridEl) {
    if (!gridEl) return;
    tilePositions = [];
    for (const tile of gridEl.children) {
        const rect = tile.getBoundingClientRect();
        tilePositions.push({
            el: tile,
            center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            hitRadius: 0.45 * tile.offsetWidth
        });
    }
}

function resizeCanvas() {
    if (!activeGridEl || !activeCanvasEl) return;
    const gridRect = activeGridEl.getBoundingClientRect();
    activeCanvasEl.width = gridRect.width;
    activeCanvasEl.height = gridRect.height;
    cacheTilePositions(activeGridEl);
    drawLines();
}

function drawLines() {
    if (!activeCtx || !activeCanvasEl) return;
    clearLines();
    if (selectedTiles.length < 2) return;

    activeCtx.beginPath();
    activeCtx.strokeStyle = "rgba(59, 130, 246, 0.7)";
    activeCtx.lineWidth = 12;
    activeCtx.lineCap = "round";
    activeCtx.lineJoin = "round";

    selectedTiles.forEach((tile, index) => {
        const center = getTileCenter(tile);
        if (index === 0) {
            activeCtx.moveTo(center.x, center.y);
        } else {
            activeCtx.lineTo(center.x, center.y);
        }
    });
    activeCtx.stroke();
}

function clearLines() {
    if (activeCtx && activeCanvasEl) {
        activeCtx.clearRect(0, 0, activeCanvasEl.width, activeCanvasEl.height);
    }
}

function getTileCenter(tile) {
    if (!activeGridEl) return { x: 0, y: 0 };
    const gridRect = activeGridEl.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    return {
        x: tileRect.left + tileRect.width / 2 - gridRect.left,
        y: tileRect.top + tileRect.height / 2 - gridRect.top
    };
}

    function checkNoClumps(board) {
        for (let row = 0; row <= 2; row++) {
            for (let col = 0; col <= 2; col++) {
                const topLeft = row * GRID_COLS + col;
                const topRight = topLeft + 1;
                const bottomLeft = topLeft + GRID_COLS;
                const bottomRight = bottomLeft + 1;

                const clumpLetters = [board[topLeft], board[topRight], board[bottomLeft], board[bottomRight]];
                const areAllVowels = clumpLetters.every(letter => VOWELS.includes(letter));
                const areAllConsonants = clumpLetters.every(letter => !VOWELS.includes(letter));

                if (areAllVowels || areAllConsonants) {
                    return false;
                }
            }
        }
        return true;
    }
    
    function generateAndValidateBoard(existingBoard = null, validatorFn = isBoardPlayable, wordToAvoid = null) {
    const MAX_ATTEMPTS = 200;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let board = existingBoard ? [...existingBoard] : new Array(GRID_SIZE).fill(null);
        
        board.forEach((tile, index) => {
            if (tile === null) {
                board[index] = getRandomLetter();
            }
        });

        if (validatorFn(board)) {
            if (wordToAvoid) {
                const newWords = solveBoard(board, fullDictionaryTrie);
                if (newWords.has(wordToAvoid)) {
                    continue; 
                }
            }
            // ✅ FIX: The console message has been added back.
            console.log(`Generated a valid board in ${i + 1} attempts.`);
            return board;
        }
    }

    console.error(`FAILED to generate a valid board after ${MAX_ATTEMPTS} attempts.`);
    
    let fallbackBoard = existingBoard ? [...existingBoard] : new Array(GRID_SIZE).fill(null);
    fallbackBoard.forEach((tile, index) => {
        if (tile === null) fallbackBoard[index] = getRandomLetter();
    });
    return fallbackBoard;
}
    
   function isBoardPlayable(board) {
    const vowelCount = board.filter(letter => VOWELS.includes(letter)).length;
    if (vowelCount < 4 || vowelCount > 7) return false;

    const hardConsonantCount = board.filter(letter => HARD_CONSONANTS.includes(letter)).length;
    if (hardConsonantCount > 1) return false;

    const qIndex = board.indexOf("Q");
    if (qIndex !== -1 && !getNeighbors(qIndex, board).some(letter => letter === "U")) {
        return false;
    }

    const solvableWords = solveBoard(board, validationTrie);

    // --- ADD THIS LINE (to be removed) ---
    //console.log('Available words on board:', Array.from(solvableWords).sort());

        // This is the new, stricter logic
    const threeLetterWords = Array.from(solvableWords).filter(w => w.length === 3).length;
    const fourLetterWords = Array.from(solvableWords).filter(w => w.length === 4).length;
    const fiveLetterWords = Array.from(solvableWords).filter(w => w.length >= 5).length;

    // Now, require more words, including at least one 5-letter word
    if (threeLetterWords < 4 || fourLetterWords < 3 || fiveLetterWords < 1) {
        return false;
    }

    if (!checkNoClumps(board)) return false;

    return true;
}
    
    function getNeighbors(index, board) {
        const neighbors = [];
        const [col, row] = [index % GRID_COLS, Math.floor(index / GRID_COLS)];

        for (let r_offset = -1; r_offset <= 1; r_offset++) {
            for (let c_offset = -1; c_offset <= 1; c_offset++) {
                if (r_offset === 0 && c_offset === 0) continue;

                const [checkCol, checkRow] = [col + c_offset, row + r_offset];
                if (checkCol >= 0 && checkCol < GRID_COLS && checkRow >= 0 && checkRow < GRID_COLS) {
                    neighbors.push(board[checkRow * GRID_COLS + checkCol]);
                }
            }
        }
        return neighbors;
    }
    
    function solveBoard(board, trie) {
    const foundWordsSet = new Set();
    for (let i = 0; i < GRID_SIZE; i++) {
        findWordsRecursive(i, "", [i], foundWordsSet, board, trie);
    }
    return foundWordsSet;
}

   function findWordsRecursive(tileIndex, currentPrefix, path, foundWordsSet, board, trie) {
    currentPrefix += board[tileIndex];

    if (!trie || !trie.search(currentPrefix, true)) {
        return;
    }

    if (currentPrefix.length >= 3 && trie.search(currentPrefix)) {
        foundWordsSet.add(currentPrefix);
    }

    const [col, row] = [tileIndex % GRID_COLS, Math.floor(tileIndex / GRID_COLS)];
    for (let r_offset = -1; r_offset <= 1; r_offset++) {
        for (let c_offset = -1; c_offset <= 1; c_offset++) {
            if (r_offset === 0 && c_offset === 0) continue;

            const [nextCol, nextRow] = [col + c_offset, row + r_offset];
            const nextIndex = nextRow * GRID_COLS + nextCol;

            if (nextCol >= 0 && nextCol < GRID_COLS && nextRow >= 0 && nextRow < GRID_COLS && !path.includes(nextIndex)) {
                findWordsRecursive(nextIndex, currentPrefix, [...path, nextIndex], foundWordsSet, board, trie);
            }
        }
    }
}

    async function shareScore() {
        const bestWordFound = foundWords.length > 0 ? foundWords.reduce((best, current) => current.score > best.score ? current : best, { word: '', score: 0 }) : null;
        let shareText = `I just scored ${score} on Word Worm! 🐛\n`;
        if (bestWordFound && bestWordFound.word) {
            shareText += `My best word was ${bestWordFound.word.toUpperCase()} for ${bestWordFound.score} points!\n\n`;
        }
        const gameUrl = 'https://wordwormgame.com/';
        shareText += `Think you can beat me? Play now:\n${gameUrl}`;
        const shareData = { title: 'Word Worm', text: shareText };
        if (navigator.share) {
            try { await navigator.share(shareData); console.log('Score shared successfully!'); } catch (err) { console.error('Share failed:', err); }
        } else {
            try {
                await navigator.clipboard.writeText(shareText);
                const shareButton = document.getElementById('share-score-link');
                if (shareButton) {
                    const originalText = shareButton.innerHTML;
                    shareButton.innerHTML = 'Copied! ✓';
                    shareButton.classList.add('text-green-500');
                    setTimeout(() => {
                        shareButton.innerHTML = originalText;
                        shareButton.classList.remove('text-green-500');
                    }, 2000);
                }
            } catch (err) { console.error('Failed to copy: ', err); alert('Could not copy score to clipboard.'); }
        }
    }

   function showEndGameScreen() {
    endGameModal.classList.remove('hidden');
    
    const sortedWords = [...foundWords].sort((a,b)=>b.score-a.score);
    const foundWordsHTML = sortedWords.length ? sortedWords.map(fw => `<div class="flex justify-between text-sm p-1 ${sortedWords.indexOf(fw) % 2 === 0 ? 'bg-slate-50' : ''} rounded"><span class="font-semibold">${fw.word.toUpperCase()}</span><span>+${fw.score}</span></div>`).join('') : '<p class="text-sm text-slate-500 text-center py-4">No words found.</p>';

    endGameModalContent.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
        <h2 class="text-3xl font-black text-green-500">Great Game!</h2>
        <p class="text-slate-600 mb-2">Your final score is:</p>
        <p id="final-score-display" class="text-6xl font-black text-slate-800 mb-3">${score}</p>
        
        <div id="submission-container" class="min-h-8 flex items-center justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
        </div>

        <hr class="my-4">
        <div class="text-left w-full">
            <div class="flex justify-between items-baseline mb-2">
                <h3 class="text-xl font-bold text-slate-700">Your Words (${foundWords.length})</h3>
                <button id="endgame-stats-button" class="flex items-center text-base font-bold text-blue-500 hover:text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                    <span class="ml-1">Your Stats</span>
                </button>
            </div>
            <div class="space-y-1 max-h-48 overflow-y-auto pr-2">${foundWordsHTML}</div>
        </div>
        <div id="share-link-container" class="h-10 flex items-center justify-center"></div>
        <div class="flex space-x-2 mt-3">
            <button id="endgame-leaderboard-button" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-lg text-base flex-1">Leaderboard</button>
            <button id="play-again-button" class="bg-green-500 hover:bg-green-600 w-full text-white font-bold py-3 px-4 rounded-lg text-base flex-1">Play Again</button>
        </div>
        <div class="text-center text-xs text-slate-400 mt-4">
            <p>&copy; 2026 Word Worm</p>
            <p><a href="/about.html" class="hover:underline">About</a> &bull; <a href="/contact.html" class="hover:underline">Contact</a> &bull; <a href="/privacy.html" class="hover:underline">Privacy Policy</a> &bull; <a href="/terms.html" class="hover:underline">Terms of Use</a></p>
        </div>
    </div>`;
    
    const scoreDisplay = document.getElementById('final-score-display');
    if (scoreDisplay) {
        triggerEndGameConfetti(scoreDisplay);
    }
    
    // This call happens after the modal is shown. processEndOfGame will
    // then replace the spinner with the name input if needed.
    if (!isPracticeMode && db && userId) {
        processEndOfGame(score, foundWords, userId);
    }

    document.getElementById('play-again-button').onclick = resetGame;
    document.getElementById('endgame-leaderboard-button').onclick = () => showLeaderboardModal(currentGamemode === 'daily' ? 'challenge' : 'daily');
    document.getElementById('endgame-stats-button').onclick = () => showProfileModal('stats');
    
    const shareLinkContainer = document.getElementById('share-link-container');
    if (navigator.share || navigator.clipboard) {
        const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>`;        shareLinkContainer.innerHTML = `<a href="#" id="share-score-link" class="flex items-center text-blue-500 hover:underline font-bold">${shareIcon} Share Score</a>`;
        shareLinkContainer.innerHTML = `<a href="#" id="share-score-link" class="flex items-center text-blue-500 hover:underline font-bold">${shareIcon} Share Score</a>`;
        document.getElementById('share-score-link').onclick = (e) => { e.preventDefault(); shareScore(); };
    }
}
    
    function updateEndGameSubmissionUI(playerName, rankInfo) {
    const submissionContainer = document.getElementById('submission-container');
    if (!submissionContainer) return;

    let finalMessageHtml = '';
    const trophyIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>`;
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;

    // ✅ FIX: This new logic prioritizes showing your rank first.
    if (rankInfo && rankInfo.rank && rankInfo.rank <= 10) {
        const leaderboardMessage = `You're&nbsp;<strong>#${rankInfo.rank}</strong>&nbsp;on today's leaderboard!`;
        finalMessageHtml = `<div class="flex items-center justify-center text-green-600 font-bold pop-in whitespace-nowrap">${trophyIcon} ${leaderboardMessage}</div>`;
    } else if (rankInfo && rankInfo.didBeatDailyHighScore) {
        const leaderboardMessage = `New daily high: <strong>${score}</strong>!`;
        finalMessageHtml = `<div class="flex items-center justify-center text-green-600 font-bold pop-in whitespace-nowrap">${trophyIcon} ${leaderboardMessage}</div>`;
    } else {
        const standardMessage = `Score submitted as&nbsp;<strong>${playerName}</strong>!`;
        finalMessageHtml = `<div class="flex items-center justify-center text-green-600 font-bold pop-in whitespace-nowrap">${checkIcon} ${standardMessage}</div>`;
    }
    submissionContainer.innerHTML = finalMessageHtml;
}
    
    
   function setupTutorial() {
    const container = document.getElementById('how-to-play-container');
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center">
            <div id="tutorial-word-builder" class="h-7 p-1 bg-white rounded-lg shadow-inner w-32 flex items-center justify-center space-x-1 mb-2"></div>
            <div id="tutorial-grid" class="grid grid-cols-4 gap-1 w-40 h-40 relative"></div>
        </div>
    `;

    const gridEl = document.getElementById('tutorial-grid');
    const wordBuilderEl = document.getElementById('tutorial-word-builder');

    const initialLetters = ['W', 'A', 'R', 'D', 'O', 'R', 'D', 'E', 'B', 'N', 'M', 'I', 'S', 'L', 'P', 'T'];
    const bonusTiles = [
        { index: 5, type: 'TL', label: 'TL' },
        { index: 15, type: 'DW', label: 'DW' },
        { index: 12, type: 'Time', label: '+5s' }
    ];

    function setupGrid(letters) {
        gridEl.innerHTML = '';
        letters.forEach((letter, i) => {
            const tile = document.createElement('div');
            const points = letterConfig[letter]?.p || 1;
            tile.className = 'tut-tile';
            tile.id = `tut-tile-${i}`;
            tile.innerHTML = `<span>${letter}<sub>${points}</sub></span>`;
            const bonus = bonusTiles.find(b => b.index === i);
            if (bonus) {
                tile.classList.add(`bonus-${bonus.type.toLowerCase()}-tut`);
                const bonusLabel = document.createElement('div');
                bonusLabel.className = 'bonus-label';
                bonusLabel.textContent = bonus.label;
                tile.appendChild(bonusLabel);
            }
            gridEl.appendChild(tile);
        });
    }

    function createFlyingScore(points, container) {
        const scoreEl = document.createElement('div');
        scoreEl.className = 'flying-score-tut';
        scoreEl.textContent = `+${points}`;
        container.appendChild(scoreEl);
        setTimeout(() => scoreEl.remove(), 1500);
    }

    function drawLine(startTile, endTile) {
        const line = document.createElement('div');
        line.className = 'line-segment';
        const rect1 = startTile.getBoundingClientRect();
        const rect2 = endTile.getBoundingClientRect();
        const gridRect = gridEl.getBoundingClientRect();
        const x1 = rect1.left + rect1.width / 2 - gridRect.left;
        const y1 = rect1.top + rect1.height / 2 - gridRect.top;
        const x2 = rect2.left + rect2.width / 2 - gridRect.left;
        const y2 = rect2.top + rect2.height / 2 - gridRect.top;
        const length = Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1 - 3}px`;
        line.style.transform = `rotate(${angle}deg)`;
        gridEl.appendChild(line);
        setTimeout(() => { line.style.opacity = '1'; }, 10);
    }

    async function animateWord(sequence, score) {
        for (let i = 0; i < sequence.length; i++) {
            if (messageModal.classList.contains('hidden')) return false;
            const step = sequence[i];
            const tile = document.getElementById(`tut-tile-${step.index}`);
            if (i > 0) {
                const prevTile = document.getElementById(`tut-tile-${sequence[i-1].index}`);
                drawLine(prevTile, tile);
                await new Promise(r => setTimeout(r, 100));
            }
            tile.classList.add('highlight');
            wordBuilderEl.innerHTML += `<span class="bg-white text-blue-500 font-bold text-sm p-0.5 rounded-md shadow-sm">${step.letter}</span>`;
            await new Promise(r => setTimeout(r, 600));
        }
        if (messageModal.classList.contains('hidden')) return false;
        createFlyingScore(score, gridEl);
        return true;
    }

    async function runAnimation() {
        if (messageModal.classList.contains('hidden')) {
            if (animationInterval) clearInterval(animationInterval);
            return;
        }

        // WORD: W(0)→O(4)→R(5)→D(6)
        wordBuilderEl.innerHTML = '';
        gridEl.querySelectorAll('.line-segment').forEach(l => l.remove());
        setupGrid(initialLetters);
        const wordSeq = [
            { index: 0, letter: 'W' }, { index: 4, letter: 'O' },
            { index: 5, letter: 'R' }, { index: 6, letter: 'D' }
        ];
        const ok1 = await animateWord(wordSeq, 9);
        if (!ok1) return;

        await new Promise(r => setTimeout(r, 1200));
        if (messageModal.classList.contains('hidden')) return;

        // WORM: W(0)→O(4)→R(5)→M(10)
        wordBuilderEl.innerHTML = '';
        gridEl.querySelectorAll('.line-segment').forEach(l => l.remove());
        setupGrid(initialLetters);
        const wormSeq = [
            { index: 0, letter: 'W' }, { index: 4, letter: 'O' },
            { index: 5, letter: 'R' }, { index: 10, letter: 'M' }
        ];
        const ok2 = await animateWord(wormSeq, 13);
        if (!ok2) return;

        await new Promise(r => setTimeout(r, 1200));
    }

    if (animationInterval) clearInterval(animationInterval);
    runAnimation();
    // Total cycle: 2 words × (4 tiles × 700ms) + 2 pauses × 1200ms = ~8s
    animationInterval = setInterval(runAnimation, 8000);

}

   function showHowToPlayModal() {
        const modal = document.getElementById('instructions-modal');
        const content = document.getElementById('instructions-modal-content');

        const sortedLetters = Object.keys(letterConfig).sort();
        const letterTilesHtml = sortedLetters.map(letter => {
            const config = letterConfig[letter];
            return `<span class="bg-slate-200 text-slate-700 font-bold rounded-sm px-1.5 py-0.5 text-[10px] leading-none">${letter}-${config.p}</span>`;
        }).join('');

        const circleLeft = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14 8l-4 4 4 4"/></svg>`;
        const circleRight = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M10 8l4 4-4 4"/></svg>`;

        content.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl modal-enter w-full max-w-xs mx-auto" style="padding: 1rem;">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">How to Play <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-slate-500"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg></h2>
                    <button id="close-instructions-button" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
                </div>
                <div style="overflow:hidden;">
                    <div id="htp-slides" style="display:flex;width:200%;transition:transform 0.3s ease;">
                        <div style="width:50%;">
                            <div class="text-left text-xs space-y-2">
                                <ul class="space-y-2 text-sm">
                                    <li class="flex items-start gap-3">
                                        <svg class="shrink-0 mt-0.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M14 8l4 4-4 4"/></svg>
                                        <span><span class="font-bold text-slate-900">How to Play:</span> <span class="text-slate-900">Trace adjacent letters to form words of 3 or more.</span></span>
                                    </li>
                                    <li class="flex items-start gap-3">
                                        <svg class="shrink-0 mt-0.5 text-green-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
                                        <span><span class="font-bold text-slate-900">Your Goal:</span> <span class="text-slate-900">Score as many points as you can in 60 seconds.</span></span>
                                    </li>
                                    <li class="flex items-start gap-3">
                                        <svg class="shrink-0 mt-0.5 text-purple-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                                        <span><span class="font-bold text-slate-900">How to Score:</span> <span class="text-slate-900">Your score is the sum of letter points and any bonuses.</span></span>
                                    </li>
                                    <li class="flex items-start gap-3">
                                        <svg class="shrink-0 mt-0.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                        <span><span class="font-bold text-slate-900">Pro-Tip:</span> <span class="text-slate-900">Use bonuses and long words to maximize your score!</span></span>
                                    </li>
                                </ul>
                                <div class="border-t pt-3">
                                    <strong class="font-semibold text-slate-800 text-sm">Daily Challenge Mode:</strong>
                                    <p class="mt-1.5 text-slate-900 text-sm">The Daily Challenge is a static board that resets every day. Find as many words as you can, then hit <span class="font-semibold">Submit</span> when done to be added to the leaderboard!</p>
                                </div>
                            </div>
                        </div>
                        <div style="width:50%;">
                            <div class="text-left text-xs space-y-3">
                                <div>
                                    <strong class="font-semibold text-slate-700">Bonus Tiles:</strong>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
                                        <div class="flex items-center gap-2.5"><span class="inline-block text-white text-center font-bold rounded px-2 py-1 w-11 text-[11px] leading-tight" style="background-color:#3b82f6;">DL</span><span>Double Letter</span></div>
                                        <div class="flex items-center gap-2.5"><span class="inline-block text-white text-center font-bold rounded px-2 py-1 w-11 text-[11px] leading-tight" style="background-color:#f59e0b;">DW</span><span>Double Word</span></div>
                                        <div class="flex items-center gap-2.5"><span class="inline-block text-white text-center font-bold rounded px-2 py-1 w-11 text-[11px] leading-tight" style="background-color:#ef4444;">TL</span><span>Triple Letter</span></div>
                                        <div class="flex items-center gap-2.5"><span class="inline-block text-white text-center font-bold rounded px-2 py-1 w-11 text-[11px] leading-tight" style="background-color:#22c55e;">+5s</span><span>Extra Time</span></div>
                                    </div>
                                </div>
                                <div class="border-t pt-3">
                                    <strong class="font-semibold text-slate-700">Length Bonus:</strong>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                                        <span>4 letters: <span class="font-medium">+5 pts</span></span>
                                        <span>6 letters: <span class="font-medium">+20 pts</span></span>
                                        <span>5 letters: <span class="font-medium">+10 pts</span></span>
                                        <span>7+ letters: <span class="font-medium">+40 pts</span></span>
                                    </div>
                                </div>
                                <div class="border-t pt-3">
                                    <strong class="font-semibold text-slate-700">Letter Values:</strong>
                                    <div class="flex flex-wrap gap-1.5 mt-2">${letterTilesHtml}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="border-t pt-2 pb-1 text-center mt-3">
                    <p class="text-slate-500 text-xs mb-2">Want to play without the timer?</p>
                    <button id="instructions-practice-button" class="bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-5 rounded-lg text-sm">Practice Mode</button>
                    <div class="flex items-center justify-center gap-3 mt-2">
                        <button id="htp-prev" class="text-slate-300 transition-colors">${circleLeft}</button>
                        <button id="htp-next" class="text-slate-700 transition-colors">${circleRight}</button>
                    </div>
                </div>
            </div>`;

        let currentPage = 0;
        const slidesEl = document.getElementById('htp-slides');
        const prevBtn = document.getElementById('htp-prev');
        const nextBtn = document.getElementById('htp-next');

        function goToPage(n) {
            currentPage = Math.max(0, Math.min(1, n));
            slidesEl.style.transform = `translateX(-${currentPage * 50}%)`;
            prevBtn.className = currentPage === 0 ? 'text-slate-300 transition-colors' : 'text-slate-700 transition-colors';
            nextBtn.className = currentPage === 1 ? 'text-slate-300 transition-colors' : 'text-slate-700 transition-colors';
        }

        prevBtn.onclick = () => goToPage(currentPage - 1);
        nextBtn.onclick = () => goToPage(currentPage + 1);

        const wrapper = slidesEl.parentElement;
        let touchStartX = 0;
        wrapper.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        wrapper.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40) goToPage(dx < 0 ? currentPage + 1 : currentPage - 1);
        }, { passive: true });

        modal.classList.remove('hidden');
        document.getElementById('close-instructions-button').onclick = () => modal.classList.add('hidden');
        document.getElementById('instructions-practice-button').onclick = () => {
            modal.classList.add('hidden');
            startGame(true);
        };
}

    document.getElementById('settings-dark-mode-row').addEventListener('click', () => setDarkMode(!document.documentElement.classList.contains('dark')));
    document.getElementById('pause-dark-mode-row').addEventListener('click', () => setDarkMode(!document.documentElement.classList.contains('dark')));

    document.addEventListener('DOMContentLoaded', main);
