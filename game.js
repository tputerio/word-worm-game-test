    // --- Firebase SDKs ---
    import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
    import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential, linkWithPopup, linkWithCredential, signOut, EmailAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
    import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, addDoc, getDocs, getDocsFromCache, query, where, orderBy, limit, doc, documentId, getDoc, getDocFromServer, getDocFromCache, setDoc, updateDoc, deleteDoc, increment, arrayUnion, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

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

    // --- Haptics (vibration on found words; toggle in Settings and Pause) ---
    // Requires both the Vibration API and a touch device: desktop Chrome exposes
    // navigator.vibrate but laptops can't vibrate, and iOS Safari has no
    // Vibration API at all (web pages can't trigger haptics on iPhone).
    const hapticsSupported = 'vibrate' in navigator && window.matchMedia('(pointer: coarse)').matches;
    function hapticsEnabled() {
        return hapticsSupported && localStorage.getItem('wordWormHaptics') !== 'false';
    }
    function setHaptics(on) {
        localStorage.setItem('wordWormHaptics', on ? 'true' : 'false');
        document.querySelectorAll('.haptics-toggle-track').forEach(el => {
            el.classList.toggle('active', on);
            el.setAttribute('aria-checked', String(on));
        });
    }
    function vibrateOnWord() {
        if (hapticsEnabled()) navigator.vibrate(35);
    }

    // --- Firebase State ---
    let auth, db, userId;
   // GOOGLE ANALYTICS -- let auth, db, userId, analytics;
    const isUserSignedIn = () => auth?.currentUser && !auth.currentUser.isAnonymous;

    async function signInWithProvider(provider) {
        try {
            const result = await linkWithPopup(auth.currentUser, provider);
            const user = result.user;
            userId = user.uid;
            let isNewUser = false;
            let suggestedName = null;
            if (db) {
                const playerDocRef = doc(db, "players", user.uid);
                const snap = await getDoc(playerDocRef);
                if (!snap.exists() || !snap.data().hasSubmittedName) {
                    isNewUser = true;
                    suggestedName = (user.displayName || 'Player').split(' ')[0];
                } else {
                    localStorage.setItem('wordRushPlayerName', snap.data().name);
                }
            }
            return { user, isNewUser, suggestedName };
        } catch (err) {
            if (err.code === 'auth/credential-already-in-use' || err.code === 'auth/email-already-in-use') {
                // The Google account is already tied to a different (real) account.
                // Re-using the credential from the failed link avoids opening a
                // second popup here — a second signInWithPopup call, fired async
                // from inside this catch, falls outside the original click's user
                // gesture and gets silently blocked in Safari/iOS, which is why
                // returning users hit "sign-in failed" while first-time sign-up
                // (single popup, no fallback needed) always worked.
                const credential = GoogleAuthProvider.credentialFromError(err);
                const result = credential
                    ? await signInWithCredential(auth, credential)
                    : await signInWithPopup(auth, provider);
                const user = result.user;
                userId = user.uid;
                if (db) {
                    const playerDocRef = doc(db, "players", user.uid);
                    const snap = await getDoc(playerDocRef);
                    if (snap.exists() && snap.data().name) {
                        localStorage.setItem('wordRushPlayerName', snap.data().name);
                    }
                }
                return { user, isNewUser: false, suggestedName: null };
            }
            throw err;
        }
    }

    // Signs out and clears everything device-local that belongs to the old
    // account: saved name, tracked/hidden challenge ids, seen-results markers,
    // cached stats, and daily-challenge completion/progress, so the next
    // guest or account on this device doesn't inherit them. The global
    // onAuthStateChanged listener signs the player back in anonymously — no
    // explicit signInAnonymously here, or the two calls race and mint an
    // extra throwaway anonymous account. Clearing userId here (rather than
    // waiting for that listener) prevents the welcome screen's immediate
    // re-render from fetching the old account's Firestore doc with a
    // still-stale uid.
    async function signOutAndReset() {
        await signOut(auth);
        userId = null;
        localStorage.removeItem('wordRushPlayerName');
        localStorage.removeItem('wordWormChallenges');
        localStorage.removeItem(HIDDEN_CHALLENGES_KEY);
        localStorage.removeItem(SEEN_RESULTS_KEY);
        localStorage.removeItem(MY_USERNAME_KEY);
        myUsernameCache = null;
        invalidateChallengesCache();
        lastKnownStreak = 0;
        lastKnownHighScore = 0;
        lastKnownChallengeStats = { wins: 0, losses: 0, ties: 0 };
        persistKnownStats();
        // Daily-challenge completion/in-progress records are keyed by date,
        // not uid, so they have to be swept explicitly or they leak into the
        // next guest session — a stale "completed" checkmark, or resuming the
        // old account's in-progress score/found words.
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('dailyCompleted-') || key.startsWith('dailyProgress-')) {
                localStorage.removeItem(key);
            }
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
    let allDailyWords = new Set();
    // Last streak/high score read from Firestore (or beaten live in a game).
    // UI that needs them synchronously (welcome screen, in-game "High" box)
    // renders these instead of waiting on — or scraping the DOM populated by —
    // a fetch. Seeded from localStorage so the home screen shows real numbers
    // even when the first Firestore read is slow or fails outright.
    let lastKnownStreak = parseInt(localStorage.getItem('wordWormLastStreak'), 10) || 0;
    let lastKnownHighScore = parseInt(localStorage.getItem('wordWormLastHighScore'), 10) || 0;
    let lastKnownChallengeStats = (() => {
        try { return JSON.parse(localStorage.getItem('wordWormChallengeStats')) || { wins: 0, losses: 0, ties: 0 }; }
        catch(e) { return { wins: 0, losses: 0, ties: 0 }; }
    })();
    function persistKnownStats() {
        try {
            localStorage.setItem('wordWormLastStreak', String(lastKnownStreak));
            localStorage.setItem('wordWormLastHighScore', String(lastKnownHighScore));
            localStorage.setItem('wordWormChallengeStats', JSON.stringify(lastKnownChallengeStats));
        } catch(e) {}
    }
    let currentChallengeId = null;
    let pendingChallengeId = new URLSearchParams(window.location.search).get('c') || null;
    let activeGridEl;
    let activeCanvasEl;
    let activeCtx;

    // Escapes user-supplied text (player/display names) before it's interpolated
    // into innerHTML. Display names are not charset-restricted, so rendering them
    // raw would let one player run script in another player's browser.
    function escapeHTML(str) {
        return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

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


    // --- Init ---
    function main() {
        setupEventListeners();
        topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">0</div>`;
        if (pendingChallengeId) {
            showChallengeAcceptScreen(pendingChallengeId);
        } else {
            showWelcomeScreen();
        }
        loadAssets();
    }

async function showDailyEndScreen(stats, isNewSubmission = true) {
    endGameModal.classList.remove('hidden');
    endGameModalContent.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
            <h2 class="text-2xl font-black text-green-500">Daily Puzzle Complete!</h2>
            <p class="text-slate-600 my-4">Calculating your final results...</p>
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
        </div>`;

    if (isNewSubmission) {
        if (activeGridEl) activeGridEl.style.pointerEvents = 'none';

        if (db && userId) {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            // Record completion locally first — it's the offline fallback for
            // the completion check, and it must exist even if the writes below
            // stall or fail.
            try {
                localStorage.setItem(`dailyCompleted-${todayStr}`, JSON.stringify({ completed: true, score: stats.score, foundWords: stats.foundWords }));
                localStorage.removeItem(`dailyProgress-${todayStr}`);
            } catch (e) {}
            try {
                const dailyDocRef = doc(db, `players/${userId}/dailyChallenges`, todayStr);
                // Stop waiting after the timeout but let the write itself keep
                // going — the SDK queues it and delivers when the connection
                // recovers, so the end screen never hangs on "Calculating...".
                await withTimeout(setDoc(dailyDocRef, { completed: true, score: stats.score, foundWords: stats.foundWords }, { merge: true }));
            } catch (error) {
                console.error("Error marking daily challenge as complete:", error);
            }
            await withTimeout(updatePlayStreak(userId)).catch(() => {});
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
             <h2 class="text-2xl font-black text-green-500">Daily Puzzle Complete!</h2>
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
                <button id="return-home-button" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex-1">Home</button>
            </div>
            <p id="next-puzzle-countdown" class="text-xs font-semibold text-slate-500 mt-3"></p>
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
                    <input id="daily-name-input" type="text" maxlength="15" placeholder="Enter a username"
                        class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-400">
                    <button id="daily-name-submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Submit</button>
                </div>
                <p id="daily-name-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
                <button id="daily-create-account" class="text-xs text-green-500 hover:text-green-600 hover:underline mt-2 flex items-center py-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 flex-shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>Sign up to save stats across devices</button>
            </div>`;

        const doSubmitName = async (name) => {
            localStorage.setItem('wordRushPlayerName', name);
            if (db && userId) {
                try { await setDoc(doc(db, 'players', userId), { name, hasSubmittedName: true }, { merge: true }); } catch(e) {}
            }
            claimUsername(name);
            await submitDailyScoreToLeaderboard(stats.score);
            showSummaryText();
        };

        // Resolve automatically if the user completes sign-up via the account
        // modal. Guards: onAuthStateChanged fires immediately with the current
        // user, so only react to a fresh anonymous → signed-in transition, and
        // only while this prompt is still on screen — otherwise a sign-up made
        // later in the session would re-submit this stale score.
        const wasSignedInAtPrompt = isUserSignedIn();
        const unsubscribeDailyAuth = onAuthStateChanged(auth, async (user) => {
            if (!user || user.isAnonymous || wasSignedInAtPrompt) return;
            unsubscribeDailyAuth();
            if (!document.getElementById('daily-name-input')) return;
            const name = localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player';
            await doSubmitName(name);
        });

        attachUsernameCheck(document.getElementById('daily-name-input'), document.getElementById('daily-name-msg'));
        const submitTypedDailyName = async () => {
            const name = (document.getElementById('daily-name-input').value || '').trim().slice(0, 15);
            if (!name) return;
            if (!(await validateNewUsername(name, document.getElementById('daily-name-msg')))) return;
            unsubscribeDailyAuth();
            await doSubmitName(name);
        };
        document.getElementById('daily-name-submit').onclick = submitTypedDailyName;
        document.getElementById('daily-name-input').onkeydown = (e) => { if (e.key === 'Enter') submitTypedDailyName(); };
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

    startNextPuzzleCountdown();

    const shareLinkContainer = document.getElementById('share-link-container');
    if (navigator.share || navigator.clipboard) {
        const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>`;        shareLinkContainer.innerHTML = `<a href="#" id="share-score-link" class="flex items-center text-blue-500 hover:underline font-bold">${shareIcon} Share Result</a>`;
        document.getElementById('share-score-link').onclick = (e) => { e.preventDefault(); shareDailyResult({ score: stats.score, foundCount, totalCount }); };
    }
}

// Ticks the "Next puzzle in Xh Ym" line on the daily end screen. The interval
// self-clears once the element is gone (modal closed or re-rendered).
let nextPuzzleCountdownInterval;
function startNextPuzzleCountdown() {
    clearInterval(nextPuzzleCountdownInterval);
    const update = () => {
        const el = document.getElementById('next-puzzle-countdown');
        if (!el) { clearInterval(nextPuzzleCountdownInterval); return; }
        const nyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const nextMidnight = new Date(nyNow);
        nextMidnight.setHours(24, 0, 0, 0);
        const diffMins = Math.max(0, Math.round((nextMidnight - nyNow) / 60000));
        const h = Math.floor(diffMins / 60), m = diffMins % 60;
        el.textContent = `⏳ Next Daily Puzzle in ${h}h ${m}m`;
    };
    update();
    nextPuzzleCountdownInterval = setInterval(update, 30000);
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
            <p class="text-sm text-slate-500 mt-2 mb-6">Ready to submit? You can only play the Daily Puzzle once per day.</p>
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
                <h2 class="text-2xl font-black text-green-500">Daily Puzzle Complete!</h2>
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
    const playButton = document.getElementById('play-button');
    const playPracticeButton = document.getElementById('play-practice-button');
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
            // Persistent local cache: reads fall back to IndexedDB when the
            // network is slow/unavailable, data survives reloads, and writes
            // queue offline. Single-tab manager, deliberately NOT multi-tab:
            // multi-tab elects one "primary" tab that owns the network, and
            // iOS Safari freezes background tabs — a frozen primary stalls
            // every read/write in the tab the player is actually using. With
            // single-tab, each tab owns its own connection; if another tab
            // already holds the cache lock, the SDK falls back to in-memory
            // cache (also the case where IndexedDB isn't available, e.g. some
            // private-browsing modes).
            try {
                db = initializeFirestore(app, {
                    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
                    // Firestore's streaming transport silently stalls for 10-30s
                    // on some mobile browsers/networks (iOS content blockers,
                    // iCloud Private Relay). Long polling works everywhere, and
                    // this app only does one-shot reads — no realtime listeners
                    // that would benefit from streaming.
                    experimentalForceLongPolling: true
                });
            } catch (e) {
                console.warn('Persistent cache unavailable, using default Firestore:', e);
                db = getFirestore(app);
            }
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
                    updateChallengeNotifDot();
                    if (pendingChallengeId) {
                        showChallengeAcceptScreen(pendingChallengeId);
                    }
                } else {
                    signInAnonymously(auth).catch(err => console.error("Anonymous sign-in failed:", err));
                }
            });

            // iOS Safari suspends the page (and can wedge Firestore's
            // connection) while the app is backgrounded — resume is exactly
            // when local state is most likely stale or a load has silently
            // died. Refresh the cheap, player-visible bits on return to
            // foreground: one player-doc read plus a challenges load that the
            // 60s cache TTL usually short-circuits.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && userId) {
                    fetchPlayerStats(userId);
                    updateChallengeNotifDot();
                }
            });
        } catch (firebaseError) {
            console.warn("Firebase features failed to load, continuing in offline mode:", firebaseError);
            if (globalPlayCountSpan) globalPlayCountSpan.textContent = "N/A";
            // A ?c= link renders "Loading challenge..." and waits on auth; if
            // Firebase never comes up, give the player a way out instead of an
            // infinite spinner.
            if (pendingChallengeId) {
                modalContent.innerHTML = `<div class="bg-white rounded-2xl shadow-lg p-6 text-center"><p class="text-red-500 mb-4">Failed to load challenge. Check your connection and refresh to try again.</p><button id="challenge-go-home" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2">${HOME_ICON} Return Home</button></div>`;
                document.getElementById('challenge-go-home').onclick = () => { history.replaceState(null,'',window.location.pathname); pendingChallengeId = null; showWelcomeScreen(); };
            }
        }
    };
    
    const loadDictionaryAndEnableButtons = async () => {
        if (playButton && playButton.disabled) return; // Don't re-run if already loaded

        if (playButton) {
            playButton.disabled = true;
            playButton.innerHTML = `<div class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading...</span></div>`;
        }
        if (playPracticeButton) { playPracticeButton.disabled = true; }
        
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

            if (playButton) {
                playButton.disabled = false;
                playButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg><span>Play</span>`;
            }
            if (playPracticeButton) { playPracticeButton.disabled = false; }

        } catch (e) {
            console.error("Critical Asset loading failed (Dictionaries):", e);
            if (loadingErrorEl) loadingErrorEl.textContent = "Error: Could not load game dictionaries.";
            if (playButton) { playButton.innerHTML = `<span>Error</span>`; playButton.classList.add('bg-red-500'); }
            if (playPracticeButton) { playPracticeButton.innerHTML = `<span>Error</span>`; playPracticeButton.classList.add('bg-red-500'); }
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

    // In daily/challenge mode, center the message over the grid and apply a shake animation.
    if ((currentGamemode === 'daily' || currentGamemode === 'challenge') && activeGridEl) {
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

    // Firestore reads have no client-side deadline: on a flaky connection (or
    // while another open tab holds the persistent cache's network lease) a
    // getDoc/getDocs can stall for minutes without erroring. Every UI flow that
    // blocks on a read goes through these helpers so it always settles — race
    // the server read against a timer, then fall back to the local cache.
    const READ_TIMEOUT_MS = 8000;
    function withTimeout(promise, ms = READ_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('read-timeout')), ms);
            promise.then(
                v => { clearTimeout(timer); resolve(v); },
                e => { clearTimeout(timer); reject(e); }
            );
        });
    }
    // A cold mobile connection can take 15-20s to establish. When the timeout
    // fires and the cache has nothing to offer, keep waiting on the original
    // (still-pending) server read rather than failing — a retry would start
    // from zero anyway.
    const READ_GRACE_MS = 20000;
    // Both still reject when the server is unreachable AND nothing is cached.
    async function getDocResilient(ref, ms = READ_TIMEOUT_MS) {
        const serverRead = getDoc(ref);
        try { return await withTimeout(serverRead, ms); }
        catch (e) {
            try { return await getDocFromCache(ref); }
            catch (e2) { return await withTimeout(serverRead, READ_GRACE_MS); }
        }
    }
    async function getDocsResilient(q, ms = READ_TIMEOUT_MS) {
        const serverRead = getDocs(q);
        try { return await withTimeout(serverRead, ms); }
        catch (e) {
            try {
                const cached = await getDocsFromCache(q);
                // An empty cache result usually means "never synced", not
                // "no data" — don't present it as an answer.
                if (!cached.empty) return cached;
            } catch (e2) {}
            return await withTimeout(serverRead, READ_GRACE_MS);
        }
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

    // Paint device-local state first, so a slow or failed Firestore read never
    // leaves the home screen blank ("never loaded my profile" on flaky mobile).
    // The fetch below repaints with authoritative data when it lands.
    renderPlayerStatsUI(localStorage.getItem('wordRushPlayerName') || 'Anonymous', lastKnownStreak);

    try {
        const docSnap = await getDocResilient(playerDocRef);
        let highScore = 0;
        let playerName = 'Anonymous';
        let playStreak = 0;
        let knownUsername = null;

        if (docSnap.exists()) {
            const playerData = docSnap.data();
            highScore = playerData.highScore || 0;
            playerName = playerData.name && playerData.name !== 'Anonymous' ? playerData.name : 'Anonymous';
            playStreak = playerData.playStreak || 0;
            knownUsername = playerData.username || null;
            if (playerData.username) storeUsername(playerData.username);
            if (playerData.challengeStats) lastKnownChallengeStats = { wins: 0, losses: 0, ties: 0, ...playerData.challengeStats };
        }
        lastKnownStreak = playStreak;
        lastKnownHighScore = Math.max(lastKnownHighScore, highScore);
        persistKnownStats();

        // For signed-in users Firestore is authoritative; for anonymous users prefer localStorage
        // so a saved guest name isn't overwritten by 'Anonymous' from an empty Firestore doc.
        if (!isUserSignedIn() && playerName === 'Anonymous') {
            playerName = localStorage.getItem('wordRushPlayerName') || 'Anonymous';
        }
        if (playerName !== 'Anonymous') {
            localStorage.setItem('wordRushPlayerName', playerName);
            // silent auto-claim; no-op if taken or already owned. We already
            // have this doc's username from the read above, so pass it through
            // instead of making claimUsername re-read the same doc.
            claimUsername(playerName, knownUsername);
        }

        renderPlayerStatsUI(playerName, playStreak);
    } catch (e) {
        console.error("Could not fetch player stats:", e);
    }
}

    function renderPlayerStatsUI(playerName, playStreak) {
        const highScoreEl = document.getElementById('high-score');
        if (highScoreEl) highScoreEl.textContent = lastKnownHighScore;

        const welcomeHighScoreEl = document.getElementById('welcome-high-score');
        if (welcomeHighScoreEl) welcomeHighScoreEl.textContent = lastKnownHighScore.toLocaleString();

        const welcomeStreakEl = document.getElementById('welcome-streak');
        const streakFlameEl = document.getElementById('welcome-streak-flame');
        const streakLabelEl = document.getElementById('welcome-streak-label');
        if (welcomeStreakEl) {
            if (!playStreak || playStreak === 0) {
                welcomeStreakEl.style.display = 'none';
                if (streakFlameEl) streakFlameEl.style.color = '#94a3b8';
                if (streakLabelEl) { streakLabelEl.textContent = 'Start a streak!'; streakLabelEl.style.fontSize = '8px'; }
            } else {
                welcomeStreakEl.textContent = playStreak;
                welcomeStreakEl.style.display = '';
                if (streakFlameEl) streakFlameEl.style.color = '#f97316';
                if (streakLabelEl) { streakLabelEl.textContent = 'Day Streak'; streakLabelEl.style.fontSize = '10px'; }
            }
        }

        const playerGreetingEl = document.getElementById('player-greeting');
        if (playerGreetingEl) {
            if (playerName !== 'Anonymous') {
                if (isUserSignedIn()) {
                    playerGreetingEl.innerHTML = `Welcome back, <strong class="font-bold">${escapeHTML(playerName)}</strong>! 👋`;
                } else {
                    playerGreetingEl.innerHTML = `Welcome back, <strong class="font-bold">${escapeHTML(playerName)}</strong>! 👋 &bull; <span id="greeting-signin-link" class="text-blue-500 hover:underline cursor-pointer">Add email</span>`;
                    setTimeout(() => {
                        const link = document.getElementById('greeting-signin-link');
                        if (link) link.onclick = () => showAccountModal('signup');
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
            if (currentGamemode !== 'daily') {
                const randomBonus = currentGamemode === 'challenge' ? getBonusTypeNoTime() : getBonusType();
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

    function getBonusType() {
        const rand = Math.random();
        if (rand < 0.08) return { type: 'Time', label: '+5s', class: 'bonus-Time' };
        if (rand < 0.18) return { type: 'DW', label: 'DW', class: 'bonus-DW' };
        if (rand < 0.28) return { type: 'TL', label: 'TL', class: 'bonus-TL' };
        if (rand < 0.40) return { type: 'DL', label: 'DL', class: 'bonus-DL' };
        return null;
    }

    function getBonusTypeNoTime() {
        const rand = Math.random();
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

            // If not in cache, try to get from Firestore. Cap each attempt so a
            // stalled read can't pin the loop past the overall deadline — the
            // outer while only checks the clock between attempts.
            if (db) {
                const puzzleRef = doc(db, "dailyPuzzles", todayStr);
                const docSnap = await withTimeout(getDoc(puzzleRef), 4000);
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

 async function startGame(practiceMode = false, gameMode = 'standard', challengeData = null) {
    if (!db) {
        showGameMessage("Connecting...");
        return;
    }

    if (gameMode === 'challenge') {
        if (!challengeData) { showGameMessage('Challenge data missing.', 'error'); return; }
        isEndingGame = false;
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('daily-challenge-content').style.display = 'none';
        gameContentEl.style.display = 'block';
        currentGamemode = 'challenge';
        isPracticeMode = false;
        menuContainer.classList.remove('hidden');
        messageModal.classList.add('hidden');
        score = 0;
        foundWords = [];
        updateScoreDisplay();
        timer = GAME_TIME;
        topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">0</div>`;
        updateTimerUI();
        timerInterval = setInterval(() => { timer--; updateTimerUI(); if (timer <= 0) endGame(); }, 1000);
        clearInterval(animationInterval);
        activeGridEl = document.getElementById('grid');
        activeCanvasEl = document.getElementById('line-canvas');
        activeCtx = activeCanvasEl.getContext('2d');
        createGrid(challengeData.board, activeGridEl, challengeData.bonuses || []);
        attachGridListeners(activeGridEl);
        activeGridEl.style.pointerEvents = 'auto';
        return;
    }

    if (gameMode === 'daily') {
        const modeBtn = document.getElementById('mode-daily-btn');
        const modeBtnHTML = modeBtn ? modeBtn.innerHTML : '';
        if (modeBtn) { modeBtn.disabled = true; modeBtn.innerHTML = `<div class="flex items-center justify-center"><svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`; }

        const puzzleData = await getDailyPuzzleWithTimeout();

        if (!puzzleData) {
            showGameMessage("Today's puzzle isn't ready. Check your connection and try again.", "error");
            // Put the button back to its label — leaving the spinner reads as
            // an endless load once the toast disappears.
            if (modeBtn) { modeBtn.disabled = false; modeBtn.innerHTML = modeBtnHTML; }
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
                const docSnap = await getDocResilient(dailyDocRef);
                if (docSnap.exists() && docSnap.data().completed === true) {
                    hasCompleted = true;
                    finalSavedData = docSnap.data();
                }
            } catch (e) {
                console.error("Error loading daily completion status from Firebase:", e);
                // Server unreachable and nothing cached — the local completion
                // record keeps a finished puzzle from reopening as playable.
                try {
                    const localDone = JSON.parse(localStorage.getItem(`dailyCompleted-${todayStr}`) || 'null');
                    if (localDone && localDone.completed) { hasCompleted = true; finalSavedData = localDone; }
                } catch (e2) {}
            }
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
            topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">${lastKnownHighScore}</div>`;
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

    topLeftDisplayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 uppercase tracking-wider">High</div><div id="high-score" class="text-3xl font-black text-slate-400">${lastKnownHighScore}</div>`;

    showWelcomeScreen();
}

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

let resizeListenerAttached = false;
function attachGridListeners(gridEl) {
    if (!gridEl) return;

    // Attach at most once per grid element — the handlers are shared module-level
    // functions, so re-running this for the same element would double-fire them.
    if (!gridEl.dataset.listenersAttached) {
        gridEl.addEventListener('pointerdown', startInteraction);
        gridEl.addEventListener('pointermove', moveInteraction);
        gridEl.addEventListener('pointerup', endInteraction);
        gridEl.addEventListener('pointerleave', endInteraction);
        gridEl.dataset.listenersAttached = 'true';
    }

    resizeCanvas();
    if (!resizeListenerAttached) {
        window.addEventListener('resize', resizeCanvas);
        resizeListenerAttached = true;
    }
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
                        <div id="instruction-text" class="text-xs text-slate-500 w-full pr-2"><strong>Daily Puzzle (${dateString}):</strong> Find as many words as possible, then hit Submit when done!</div>
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

        if (currentGamemode === 'challenge') {
            showChallengeEndScreen({ score, foundWords });
            return;
        }

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

            const bonusType = currentGamemode === 'challenge' ? getBonusTypeNoTime() : getBonusType();
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
        vibrateOnWord();

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

            if (timeBonus > 0 && !isPracticeMode && currentGamemode !== 'challenge') { timer += timeBonus; updateTimerUI(); }

            foundWords.push({ word, score: finalScore, length: word.length });
            createFlyingScore(finalScore, selectedTiles[0]);
            triggerConfetti(selectedTiles);
            vibrateOnWord();
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
            wordSpan.className = "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-100 font-semibold text-xs px-2 py-0.5 rounded-md";
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
            listEl.innerHTML = sortedWords.map(word => `<span class="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 font-semibold text-xs px-2 py-0.5 rounded-md">${word.toUpperCase()}</span>`).join('');
        } else {
            listEl.innerHTML = `<p class="w-full text-center text-sm text-slate-400">You haven't found any words yet!</p>`;
        }
    }
}

async function submitDailyScoreToLeaderboard(finalScore) {
    if (!db || !userId) {
        console.warn("Firebase not ready, can't submit daily score.");
        return;
    }
    const playerName = localStorage.getItem('wordRushPlayerName') || 'Player';

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
    
 async function updatePlayStreak(uId) {
    if (!db || !uId) return;
    const playerDocRef = doc(db, "players", uId);
    try {
        const playerDoc = await getDoc(playerDocRef);
        const oldData = playerDoc.exists() ? playerDoc.data() : {};

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        const playStreak = (oldData.lastPlayDate === yesterdayStr) ? (oldData.playStreak || 0) + 1
            : (oldData.lastPlayDate === todayStr) ? (oldData.playStreak || 1)
            : 1;
        lastKnownStreak = playStreak;

        await setDoc(playerDocRef, { lastPlayed: serverTimestamp(), lastPlayDate: todayStr, playStreak }, { merge: true });
    } catch (e) {
        console.error("Failed to update play streak:", e);
    }
}

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
                    <input id="endgame-name-input" type="text" maxlength="15" placeholder="Enter a username"
                        class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-400">
                    <button id="endgame-name-submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Submit</button>
                </div>
                <p id="endgame-name-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
                <button id="endgame-create-account" class="text-xs text-green-500 hover:text-green-600 hover:underline mt-2 flex items-center py-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 flex-shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>Sign up to save stats across devices</button>
            </div>`;

        const enteredName = await new Promise(resolve => {
            let unsubscribeAuth = null;
            // Always detach the auth listener when the prompt resolves, so a
            // sign-up later in the session can't re-trigger this stale prompt.
            const finish = (name) => { if (unsubscribeAuth) unsubscribeAuth(); resolve(name); };
            const doSubmit = async () => {
                const name = (document.getElementById('endgame-name-input').value || '').trim().slice(0, 15);
                if (!name) return;
                if (!(await validateNewUsername(name, document.getElementById('endgame-name-msg')))) return;
                finish(name);
            };
            // Resolve automatically if the user completes sign-up via the account
            // modal — but only on a fresh anonymous → signed-in transition, since
            // onAuthStateChanged fires immediately with the current user.
            const wasSignedInAtPrompt = isUserSignedIn();
            unsubscribeAuth = onAuthStateChanged(auth, (user) => {
                if (!user || user.isAnonymous || wasSignedInAtPrompt) return;
                finish(localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player');
            });
            attachUsernameCheck(document.getElementById('endgame-name-input'), document.getElementById('endgame-name-msg'));
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
        // Claim only freshly entered names here; existing names are auto-claimed at app open.
        if (needsToSubmitName && finalPlayerName !== 'Anonymous') claimUsername(finalPlayerName, oldData.username || null);

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

            // data.topByHighScore is exactly what was just written — no need
            // to pay for another read just to find the rank in it.
            const rankIndex = (data.topByHighScore || []).findIndex(p => p.userID === uId);
            if (rankIndex !== -1) dailyRank = rankIndex + 1;
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
                // Challenge mode reuses this element but starts it at 0 as a
                // per-game marker — only standard games set the real high score.
                if (currentGamemode === 'standard') { lastKnownHighScore = Math.max(lastKnownHighScore, score); persistKnownStats(); }
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
                    <img src="assets/word-worm-logo-icon.webp" alt="Word Worm Logo" class="w-11 h-11 mr-2" width="44" height="44">
                    <span>Word Worm</span>
                </h1>
                <button id="settings-gear-btn" class="p-1 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd" /></svg>
                </button>
            </div>
            <p id="player-greeting" class="text-slate-500 text-sm mb-3 font-medium text-center"></p>

<div id="how-to-play-container" class="bg-slate-100 p-3 rounded-lg flex flex-col w-full"></div>

     <div class="mt-4 flex flex-col gap-3">
    <button id="mode-timed-btn" class="bg-green-500 hover:bg-green-600 w-full text-white font-bold h-11 px-4 rounded-xl text-base flex items-center justify-center transition-colors gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg>
        <span>Play</span>
    </button>
    <div class="grid grid-cols-2 gap-3">
        <button id="mode-daily-btn" class="flex items-center justify-center gap-2 bg-white border-2 text-blue-600 font-bold text-sm h-10 rounded-lg hover:bg-blue-50 transition-colors" style="border-color:#3b82f6;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875c-1.243 0-2.25.84-2.25 1.875 0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.036 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" /></svg>
            Daily Puzzle<span id="daily-mode-badge" style="display:none;margin-left:4px;font-size:0.7rem;opacity:0.8;">✓</span>
        </button>
        <button id="mode-challenge-btn" class="flex items-center justify-center gap-2 bg-white border-2 text-slate-600 font-bold h-10 rounded-lg hover:bg-slate-50 transition-colors" style="border-color:#64748b;font-size:0.8rem;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
            Challenge a Friend
        </button>
    </div>
</div>
            
            <div class="bg-white rounded-xl mt-4 overflow-hidden border border-slate-200">
                <div class="grid grid-cols-3 text-center">
                    <div class="p-2 flex flex-col items-center justify-center">
                        <div class="h-7 flex items-center justify-center gap-1">
                            <svg id="welcome-streak-flame" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" style="color:#94a3b8;"><path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clip-rule="evenodd" /></svg>
                            <span id="welcome-streak" class="text-xl font-black" style="color:#f97316;display:none;">0</span>
                        </div>
                        <div id="welcome-streak-label" class="font-bold text-slate-500 uppercase tracking-wider" style="font-size:8px;white-space:nowrap;">Start a streak!</div>
                    </div>

                    <div class="p-2 flex flex-col items-center justify-center border-l border-r border-slate-200">
                        <div class="h-7 flex items-center justify-center">
                            <span id="welcome-high-score" class="text-xl font-black text-slate-800">${lastKnownHighScore.toLocaleString()}</span>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your High</div>
                    </div>

                    <a href="#" id="welcome-leaderboard-button" class="p-2 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors">
                        <div class="h-7 flex items-center justify-center text-green-500">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="m6.115 5.19.319 1.913A6 6 0 0 0 8.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 0 0 2.288-4.042 1.087 1.087 0 0 0-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 0 1-.98-.314l-.295-.295a1.125 1.125 0 0 1 0-1.591l.13-.132a1.125 1.125 0 0 1 1.3-.21l.603.302a.809.809 0 0 0 1.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 0 0 1.528-1.732l.146-.292M6.115 5.19A9 9 0 1 0 17.18 4.64M6.115 5.19A8.965 8.965 0 0 1 12 3c1.929 0 3.716.607 5.18 1.64" /></svg>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Leaderboard</div>
                    </a>
                </div>
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
    
    document.getElementById('mode-timed-btn').onclick = () => startGame(false, 'standard');
    document.getElementById('mode-challenge-btn').onclick = () => showChallengeFriendModal();
    document.getElementById('mode-daily-btn').onclick = () => startGame(false, 'daily');
    updateChallengeNotifDot();

    // Always repopulate the greeting/stats — sign-up links the anonymous account
    // in place (same uid), so onAuthStateChanged doesn't re-fire for it. Right
    // after a sign-out, userId is briefly null (cleared by signOutAndReset,
    // not yet replaced by the new anonymous uid) — render the guest state
    // directly instead of skipping the repaint, so the old identity doesn't
    // linger on screen while the new anonymous sign-in is still in flight.
    if (userId) fetchPlayerStats(userId);
    else renderPlayerStatsUI('Anonymous', 0);

    // Daily puzzle status on the button: ✓ once submitted, red dot when a
    // started puzzle is still waiting to be submitted.
    (async () => {
        try {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const localDone = JSON.parse(localStorage.getItem(`dailyCompleted-${todayStr}`) || 'null');
            let completed = !!(localDone && localDone.completed);
            if (!completed && db && userId) {
                const snap = await getDocResilient(doc(db, `players/${userId}/dailyChallenges`, todayStr));
                completed = !!(snap.exists() && snap.data().completed);
            }
            if (completed) {
                const badge = document.getElementById('daily-mode-badge');
                if (badge) badge.style.display = 'inline';
            } else if (localStorage.getItem(`dailyProgress-${todayStr}`)) {
                addNotifDot(document.getElementById('mode-daily-btn'));
            }
        } catch(e) {}
    })();
}

    // ---- Usernames (unique, searchable player identities) ----
    // usernames/{lowercased} -> { uid, displayName }. Claimed silently on every
    // app start (fetchPlayerStats) and after games, as soon as the player has a
    // saved name. Uniqueness is only enforced among claimed names, so legacy
    // duplicate display names keep working until their owner opts into the
    // challenge feature.

    const normalizeUsername = (name) => (name || '').trim().toLowerCase();
    const isValidUsername = (name) => /^[a-z0-9_-]{2,15}$/.test(normalizeUsername(name));

    // Once we know this player's username, keep it in memory so the challenge
    // modal's "Send to a username" section renders instantly instead of waiting
    // on a Firestore read every time it opens.
    let myUsernameCache = null;

    // The username is also mirrored to localStorage (keyed to the uid) so the
    // challenge screen renders instantly with zero reads on later visits.
    const MY_USERNAME_KEY = 'wordWormMyUsername';
    function getStoredUsername() {
        try {
            const v = JSON.parse(localStorage.getItem(MY_USERNAME_KEY) || 'null');
            return v && v.uid === userId ? v.uname : null;
        } catch(e) { return null; }
    }
    function storeUsername(uname) {
        myUsernameCache = uname;
        try { localStorage.setItem(MY_USERNAME_KEY, JSON.stringify({ uid: userId, uname })); } catch(e) {}
    }

    // Returns 'invalid' | 'available' | 'mine' | 'taken'. Throws on network failure.
    async function checkUsernameStatus(name) {
        const uname = normalizeUsername(name);
        if (!isValidUsername(uname)) return 'invalid';
        const snap = await withTimeout(getDoc(doc(db, 'usernames', uname)));
        if (!snap.exists()) return 'available';
        return snap.data().uid === userId ? 'mine' : 'taken';
    }

    // Tries to claim `displayName` for the current player. Returns 'claimed'
    // when the player owns the username afterwards; otherwise 'taken',
    // 'invalid', or 'error' (network/offline), so callers can tell a real
    // conflict from a connectivity hiccup. Never throws.
    // knownOldUsername lets a caller that just read the player doc (e.g.
    // fetchPlayerStats) skip re-reading it here purely to compare usernames —
    // this runs silently on every app open, so that read was pure waste
    // whenever the username hadn't changed. Pass undefined when the caller
    // doesn't already know it, and this falls back to reading it itself.
    async function claimUsername(displayName, knownOldUsername = undefined) {
        try {
            if (!db || !userId) return 'error';
            const uname = normalizeUsername(displayName);
            if (!isValidUsername(uname)) return 'invalid';

            const playerRef = doc(db, 'players', userId);
            let oldUsername = knownOldUsername;
            if (oldUsername === undefined) {
                const playerSnap = await withTimeout(getDoc(playerRef));
                oldUsername = playerSnap.exists() ? playerSnap.data().username : null;
            }
            if (oldUsername === uname) { storeUsername(uname); return 'claimed'; }

            const status = await checkUsernameStatus(uname);
            if (status === 'taken') return 'taken';
            if (status === 'invalid') return 'invalid';
            if (status === 'available') {
                // Security rules only allow creating a usernames doc that doesn't
                // exist yet, so simultaneous claims are settled server-side.
                await setDoc(doc(db, 'usernames', uname), {
                    uid: userId,
                    displayName: (displayName || '').trim(),
                    createdAt: serverTimestamp()
                });
            }
            await setDoc(playerRef, { username: uname }, { merge: true });
            if (oldUsername && oldUsername !== uname) {
                try { await deleteDoc(doc(db, 'usernames', oldUsername)); } catch(e) {}
            }
            storeUsername(uname);
            return 'claimed';
        } catch(e) {
            return 'error';
        }
    }

    const USERNAME_RULES_MSG = '2–15 characters: letters, numbers, - or _';

    // Live availability feedback for a name input (new players picking a name).
    function attachUsernameCheck(inputEl, msgEl) {
        let debounceId;
        inputEl.addEventListener('input', () => {
            clearTimeout(debounceId);
            const name = inputEl.value.trim();
            if (!name) { msgEl.textContent = ''; return; }
            debounceId = setTimeout(async () => {
                try {
                    const status = await checkUsernameStatus(name);
                    if (status === 'invalid') setUsernameMsg(msgEl, USERNAME_RULES_MSG, false);
                    else if (status === 'taken') setUsernameMsg(msgEl, 'That username is taken.', false);
                    else setUsernameMsg(msgEl, 'Available!', true);
                } catch(e) { msgEl.textContent = ''; }
            }, 400);
        });
    }

    function setUsernameMsg(msgEl, text, ok) {
        msgEl.textContent = text;
        msgEl.className = `text-xs mt-1 text-left min-h-[16px] ${ok ? 'text-green-600' : 'text-red-500'}`;
    }

    // Submit-time gate for first-time name entry. Fails open on network errors
    // so a Firestore hiccup never blocks saving a score.
    async function validateNewUsername(name, msgEl) {
        try {
            const status = await checkUsernameStatus(name);
            if (status === 'invalid') { setUsernameMsg(msgEl, USERNAME_RULES_MSG, false); return false; }
            if (status === 'taken') { setUsernameMsg(msgEl, 'That username is taken. Try another.', false); return false; }
            return true;
        } catch(e) {
            return true;
        }
    }

    // Last loadAllMyChallenges result, so challenge UI can render instantly and
    // refresh in the background instead of sitting empty during the fetch.
    let myChallengesCache = null;

    // The list is also persisted to localStorage so a fresh page load can render
    // instantly, and reloaded at most once per TTL — the home-screen notif dot
    // re-runs this on every visit and shouldn't cost a Firestore query each time.
    // Anything that changes a challenge must update the cache: prefer
    // mutateChallengesCache/seedChallengeIntoCache (instant UI, no reload);
    // invalidateChallengesCache() is the blunt fallback.
    const CHALLENGES_CACHE_KEY = 'wordWormChallengesCache';
    const CHALLENGES_CACHE_TTL_MS = 15 * 1000;

    // Bumped on every mutation so a load that was already in flight can't
    // commit its pre-mutation snapshot over the updated cache.
    let challengesCacheGeneration = 0;

    // Minimal stand-in for a Firestore Timestamp, for values that can't come
    // from the server (JSON round trips, locally created docs).
    const msToTimestamp = (ms) => ms == null ? null : ({ toMillis: () => ms, toDate: () => new Date(ms) });

    // Annotate and sort raw challenge docs into the shape every consumer uses.
    function shapeChallenges(entries) {
        const now = Date.now();
        const hidden = new Set(getHiddenChallenges());
        return entries
            .filter(([id]) => !hidden.has(id))
            .map(([id, data]) => ({
                id,
                data,
                myResult: data.results?.[userId],
                otherResults: Object.entries(data.results || {}).filter(([uid]) => uid !== userId),
                expired: data.expiresAt?.toDate ? data.expiresAt.toDate() < now : false
            }))
            .sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0));
    }

    function saveChallengesCache(items) {
        try {
            // Firestore Timestamps don't survive JSON, so store millis and
            // rebuild toDate/toMillis on read.
            const slim = items.map(c => ({ id: c.id, data: { ...c.data,
                createdAt: c.data.createdAt?.toMillis?.() ?? null,
                expiresAt: c.data.expiresAt?.toDate ? c.data.expiresAt.toDate().getTime() : null
            }}));
            localStorage.setItem(CHALLENGES_CACHE_KEY, JSON.stringify({ at: Date.now(), uid: userId, items: slim }));
        } catch(e) {}
    }

    function readChallengesCache() {
        try {
            const raw = JSON.parse(localStorage.getItem(CHALLENGES_CACHE_KEY) || 'null');
            if (!raw || raw.uid !== userId || !Array.isArray(raw.items)) return null;
            const items = shapeChallenges(raw.items.map(c => [c.id, { ...c.data,
                createdAt: msToTimestamp(c.data.createdAt),
                expiresAt: msToTimestamp(c.data.expiresAt)
            }]));
            return { at: raw.at, items };
        } catch(e) { return null; }
    }

    function invalidateChallengesCache() {
        challengesCacheGeneration++;
        myChallengesCache = null;
        try { localStorage.removeItem(CHALLENGES_CACHE_KEY); } catch(e) {}
    }

    // Applies a change we just wrote to the server directly to the cached list
    // ([id, data] entries in, entries out), so challenge UIs update instantly
    // instead of spinning on a reload — Firestore reads can stall for seconds
    // on a phone that just came back from being backgrounded (e.g. the share
    // sheet). Falls back to plain invalidation when nothing is cached yet.
    function mutateChallengesCache(fn) {
        const items = myChallengesCache || readChallengesCache()?.items;
        if (!items) { invalidateChallengesCache(); return; }
        challengesCacheGeneration++;
        const next = shapeChallenges(fn(items.map(c => [c.id, c.data])));
        myChallengesCache = next;
        saveChallengesCache(next);
    }

    // Insert or replace one challenge in the cached list.
    function seedChallengeIntoCache(id, data) {
        mutateChallengesCache(entries => [[id, data], ...entries.filter(([eid]) => eid !== id)]);
    }

    // Challenges expire after 7 days, so every live doc has a participants
    // array once this date passes — the legacy queries below (and this const)
    // can then be deleted.
    const LEGACY_CHALLENGES_CUTOFF = Date.parse('2026-07-15');

    // Every challenge this player is involved in. The participants array covers
    // created, incoming, and opened-via-link challenges in one query.
    async function loadAllMyChallenges() {
        if (!db || !userId) return [];

        const cached = readChallengesCache();
        if (cached && Date.now() - cached.at < CHALLENGES_CACHE_TTL_MS) {
            myChallengesCache = cached.items;
            return cached.items;
        }
        const generationAtStart = challengesCacheGeneration;

        const map = new Map();
        let sawCacheFallback = false;
        const collect = (snap) => {
            if (snap.metadata.fromCache) sawCacheFallback = true;
            snap.docs.forEach(d => map.set(d.id, d.data()));
        };
        const queries = [
            getDocsResilient(query(collection(db, 'challenges'), where('participants', 'array-contains', userId), limit(40)))
        ];
        if (Date.now() < LEGACY_CHALLENGES_CUTOFF) {
            // Docs created before the participants field existed.
            queries.push(getDocsResilient(query(collection(db, 'challenges'), where('createdBy', '==', userId), limit(20))));
            queries.push(getDocsResilient(query(collection(db, 'challenges'), where('toUid', '==', userId), limit(20))));
        }
        (await Promise.all(queries)).forEach(collect);

        // Link challenges whose participants write hasn't landed yet (opened
        // offline, or pre-participants docs) — one batched query, not a round
        // trip per id. Revoked (deleted) challenges simply don't come back.
        const localIds = JSON.parse(localStorage.getItem('wordWormChallenges') || '[]').filter(id => !map.has(id));
        if (localIds.length > 0) {
            try {
                const chunks = [];
                for (let i = 0; i < localIds.length; i += 30) chunks.push(localIds.slice(i, i + 30));
                const snaps = await Promise.all(chunks.map(ids =>
                    getDocsResilient(query(collection(db, 'challenges'), where(documentId(), 'in', ids)))));
                snaps.forEach(snap => {
                    if (snap.metadata.fromCache) sawCacheFallback = true;
                    snap.docs.forEach(d => {
                        map.set(d.id, d.data());
                        // Already a participant → the main query covers it from now on.
                        if ((d.data().participants || []).includes(userId)) removeLocalChallengeId(d.id);
                    });
                });
            } catch(e) {}
        }

        const result = shapeChallenges(Array.from(map.entries()));
        if (generationAtStart !== challengesCacheGeneration) {
            // A challenge changed while this load was in flight, so this
            // snapshot predates it — serve the freshest local state instead
            // of committing stale data over the mutated cache.
            return myChallengesCache || readChallengesCache()?.items || result;
        }
        // Cache-fallback data may be stale (or empty only because it never
        // synced) — return it for this render, but don't pin it in memory or
        // stamp it fresh in localStorage, or every later open would instantly
        // re-render the stale list while its background refresh hits the same
        // stalled connection. Leaving both caches alone means the next open
        // retries the server (and still has the last good list to fall back on).
        if (!sawCacheFallback) {
            myChallengesCache = result;
            saveChallengesCache(result);
        }
        return result;
    }

    const isIncomingChallenge = (c) => c.data.toUid === userId && !c.myResult;

    // A challenge is still "open" with an opponent if they haven't submitted a
    // result yet (played or declined) and it hasn't expired — regardless of
    // who created it or whether I've played my side.
    function findOpenChallengeWith(opponentUid, items) {
        return (items || myChallengesCache || readChallengesCache()?.items || []).find(c => !c.expired
            && (c.data.participants || []).includes(opponentUid)
            && !c.data.results?.[opponentUid]);
    }

    // Rematch should land on an already-open challenge with this opponent
    // instead of piling up duplicates every time the button is tapped.
    async function createOrReuseRematch(toUid, toName) {
        const items = await loadAllMyChallenges();
        const open = findOpenChallengeWith(toUid, items);
        if (open) return open;
        return createChallengeDoc({ toUid, toName });
    }

    // ---- Removing challenges: decline (recipient), revoke (creator), hide (local) ----

    // Declining is recorded as a special result — the existing security rule
    // ("you may only write your own results entry") already covers it, and every
    // list/dot that keys off "do I have a result?" drops the challenge automatically.
    async function declineChallenge(challengeId) {
        const name = localStorage.getItem('wordRushPlayerName') || 'Player';
        await updateDoc(doc(db, 'challenges', challengeId), {
            [`results.${userId}`]: { declined: true, name, completedAt: serverTimestamp() }
        });
        mutateChallengesCache(entries => entries.map(([id, data]) => id === challengeId
            ? [id, { ...data, results: { ...(data.results || {}), [userId]: { declined: true, name, completedAt: null } } }]
            : [id, data]));
    }

    // Deleting a challenge you created revokes it — it disappears from the
    // recipient's incoming list too.
    async function revokeChallenge(challengeId) {
        await deleteDoc(doc(db, 'challenges', challengeId));
        removeLocalChallengeId(challengeId);
        mutateChallengesCache(entries => entries.filter(([id]) => id !== challengeId));
    }

    const HIDDEN_CHALLENGES_KEY = 'wordWormHiddenChallenges';
    function getHiddenChallenges() {
        try { return JSON.parse(localStorage.getItem(HIDDEN_CHALLENGES_KEY) || '[]'); } catch(e) { return []; }
    }
    // Local-only removal, for challenges this player neither created nor can decline.
    function hideChallengeLocally(challengeId) {
        const hidden = getHiddenChallenges();
        if (!hidden.includes(challengeId)) {
            hidden.unshift(challengeId);
            localStorage.setItem(HIDDEN_CHALLENGES_KEY, JSON.stringify(hidden.slice(0, 50)));
        }
        removeLocalChallengeId(challengeId);
        // shapeChallenges drops hidden ids, so reshaping as-is removes the card.
        mutateChallengesCache(entries => entries);
    }

    function removeLocalChallengeId(challengeId) {
        const stored = JSON.parse(localStorage.getItem('wordWormChallenges') || '[]');
        localStorage.setItem('wordWormChallenges', JSON.stringify(stored.filter(id => id !== challengeId)));
    }

    // Tracks how many opponent results the player has already seen per challenge,
    // so "your friend finished" only notifies once.
    const SEEN_RESULTS_KEY = 'wordWormSeenResults';
    function getSeenResults() {
        try { return JSON.parse(localStorage.getItem(SEEN_RESULTS_KEY) || '{}'); } catch(e) { return {}; }
    }
    function markChallengeResultsSeen(challengeId, otherResultsCount) {
        const seen = getSeenResults();
        if ((seen[challengeId] || 0) >= otherResultsCount) return;
        seen[challengeId] = otherResultsCount;
        localStorage.setItem(SEEN_RESULTS_KEY, JSON.stringify(seen));
    }
    function hasUnseenResults(c) {
        return !!c.myResult && !c.myResult.declined && c.otherResults.length > (getSeenResults()[c.id] || 0);
    }

    // Challenge docs get deleted 7 days after they're created (see
    // cleanupExpiredChallenges in functions/index.js), so a friend rivalry's
    // outcome would otherwise vanish once that doc is gone. The first time
    // either player sees both scores in, tally the result onto their own
    // lifetime record — myResult.statsCounted (a leaf under the doc's own
    // results.{uid} map) makes this a no-op on every later view of the same
    // challenge, from either player, on any device.
    function recordChallengeOutcomeIfNeeded(challengeId, myResult, otherResults) {
        if (!db || !userId || !myResult || myResult.declined || myResult.statsCounted) return;
        const topOther = [...otherResults].filter(([, r]) => r && !r.declined).sort((a, b) => b[1].score - a[1].score)[0];
        if (!topOther) return;

        const outcome = myResult.score === topOther[1].score ? 'ties' : myResult.score > topOther[1].score ? 'wins' : 'losses';

        // Mark it counted locally right away, not just after the Firestore
        // round trip — this same function gets called again moments later
        // from a different screen (e.g. My Challenges right after finishing
        // a game), and without this a fast second call would double-count
        // before the statsCounted write below has landed.
        myResult.statsCounted = true;
        try {
            mutateChallengesCache(entries => entries.map(([id, data]) => id === challengeId
                ? [id, { ...data, results: { ...(data.results || {}), [userId]: { ...(data.results?.[userId] || {}), statsCounted: true } } }]
                : [id, data]));
        } catch(e) {}

        updateDoc(doc(db, 'challenges', challengeId), { [`results.${userId}.statsCounted`]: true }).catch(() => {});
        setDoc(doc(db, 'players', userId), { challengeStats: { [outcome]: increment(1) } }, { merge: true })
            .then(() => {
                lastKnownChallengeStats[outcome] = (lastKnownChallengeStats[outcome] || 0) + 1;
                persistKnownStats();
            })
            .catch(() => {});
    }

    // A challenge needs attention if it's an unplayed incoming one, or an
    // opponent finished it since the player last looked.
    function challengeNeedsAttention(c) {
        return !c.expired && (isIncomingChallenge(c) || hasUnseenResults(c));
    }

    const NOTIF_DOT_HTML = `<span class="challenge-notif-dot" style="position:absolute;top:-5px;right:-5px;width:14px;height:14px;background:#ef4444;border-radius:9999px;border:2px solid #fff;"></span>`;

    function addNotifDot(btn) {
        if (!btn || btn.querySelector('.challenge-notif-dot')) return;
        btn.style.position = 'relative';
        btn.insertAdjacentHTML('beforeend', NOTIF_DOT_HTML);
    }

    async function updateChallengeNotifDot() {
        try {
            if (!document.getElementById('mode-challenge-btn')) return;
            const all = await loadAllMyChallenges();
            const needsAttention = all.some(challengeNeedsAttention);
            const btn = document.getElementById('mode-challenge-btn');
            if (!btn) return;
            const existing = btn.querySelector('.challenge-notif-dot');
            if (!needsAttention) { if (existing) existing.remove(); return; }
            addNotifDot(btn);
        } catch(e) {}
    }

    // ---- Challenge a Friend ----

    const HOME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`;

    // Lands on the challenge screen ("Playing against X" / Play Now) from
    // anywhere — after sending a challenge, a rematch, etc. Pass the challenge
    // data when it's already in hand to skip the re-fetch round trip. `notice`
    // is a one-line explanation shown on the screen (e.g. why the player was
    // routed to an existing game instead of a new one).
    function goToChallengeScreen(challengeId, prefetchedData = null, notice = null) {
        const accountModal = document.getElementById('account-modal');
        if (accountModal) accountModal.classList.add('hidden');
        endGameModal.classList.add('hidden');
        currentChallengeId = null;
        showChallengeAcceptScreen(challengeId, prefetchedData, notice);
    }

    function showChallengeFriendModal(view = 'create') {
        const accountModal = document.getElementById('account-modal');
        const accountModalContent = document.getElementById('account-modal-content');

        if (view === 'my-challenges') {
            renderMyChallenges(accountModalContent);
        } else {
            renderCreateChallenge(accountModalContent);
        }

        accountModal.classList.remove('hidden');
    }

    function renderCreateChallenge(container) {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-5">
                <h2 class="text-lg font-bold text-slate-800 flex items-center">Challenge a Friend <span class="inline-block w-6 h-6 ml-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-slate-600"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg></span></h2>
                <button id="close-challenge-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
            </div>
            <div id="incoming-challenges"></div>
            <div id="username-challenge-section" class="mb-4"></div>
            <button id="generate-challenge-btn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base shadow-md transition-colors flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                Share Challenge Link
            </button>
            <div id="challenge-link-result" class="mt-3"></div>
            <button id="view-my-challenges-btn" class="mt-3 w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5m4-1v5l4 2" /></svg>
                My Challenges
            </button>`;

        document.getElementById('generate-challenge-btn').onclick = () => generateAndSaveChallenge();
        document.getElementById('view-my-challenges-btn').onclick = () => renderMyChallenges(container);
        document.getElementById('close-challenge-modal').onclick = () => document.getElementById('account-modal').classList.add('hidden');

        populateIncomingChallenges(document.getElementById('incoming-challenges'), document.getElementById('view-my-challenges-btn'));
        populateUsernameChallengeSection(document.getElementById('username-challenge-section'));
    }

    // Renders pending challenges sent directly to this player at the top of the
    // modal, and dots the My Challenges button if anything in there needs attention.
    async function populateIncomingChallenges(sectionEl, myChallengesBtn) {
        const render = (all) => {
            if (!sectionEl.isConnected) return;
            // My Challenges also dots for any challenge the player still needs to
            // play — their own boards included — not just incoming/unseen ones.
            // Remove a stale dot too: the cached render may have added one that
            // the fresh data no longer justifies.
            const stillToPlay = (c) => !c.expired && !c.myResult;
            if (myChallengesBtn && myChallengesBtn.isConnected) {
                if (all.some(c => challengeNeedsAttention(c) || stillToPlay(c))) {
                    addNotifDot(myChallengesBtn);
                } else {
                    myChallengesBtn.querySelector('.challenge-notif-dot')?.remove();
                }
            }
            const incoming = all.filter(c => !c.expired && isIncomingChallenge(c));
            if (incoming.length === 0) { sectionEl.innerHTML = ''; return; }

            const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd"/></svg>`;
            const xIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;
            const visible = incoming.slice(0, 3);
            const extra = incoming.length - visible.length;
            sectionEl.innerHTML = `
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 text-left flex items-center gap-1.5">
                    <span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:9999px;"></span>
                    Incoming Challenges
                </p>
                <div class="flex flex-col gap-2 mb-4">
                    ${visible.map(c => `
                        <div class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white gap-3" style="border:2px solid #22c55e">
                            <div class="flex flex-col min-w-0 text-left">
                                <span class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(c.data.createdByName || 'A friend')} challenged you!</span>
                                <span class="text-xs text-slate-400 mt-0.5 whitespace-nowrap">${c.data.results?.[c.data.createdBy] ? `Their score: ${c.data.results[c.data.createdBy].score}` : 'They haven’t played yet'}</span>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <button class="incoming-decline-btn flex items-center justify-center rounded-lg" style="width:32px;height:32px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0" title="Decline" data-id="${c.id}">${xIcon}</button>
                                <button class="incoming-play-btn flex items-center justify-center text-white rounded-lg" style="width:32px;height:32px;background:#22c55e" data-id="${c.id}">${playIcon}</button>
                            </div>
                        </div>`).join('')}
                    ${extra > 0 ? `<button id="incoming-more-link" class="text-xs text-slate-500 hover:text-slate-700 text-center py-1">+${extra} more in My Challenges</button>` : ''}
                </div>`;

            sectionEl.querySelectorAll('.incoming-play-btn').forEach(btn => {
                btn.onclick = () => {
                    // Incoming challenges already carry our uid in participants,
                    // and the accept screen handles joining for any that don't.
                    document.getElementById('account-modal').classList.add('hidden');
                    showChallengeAcceptScreen(btn.dataset.id);
                };
            });
            sectionEl.querySelectorAll('.incoming-decline-btn').forEach(btn => {
                btn.onclick = async () => {
                    btn.disabled = true;
                    try {
                        await declineChallenge(btn.dataset.id);
                        renderCreateChallenge(document.getElementById('account-modal-content'));
                    } catch(e) {
                        console.error('Failed to decline challenge:', e);
                        btn.disabled = false;
                    }
                };
            });
            const moreLink = sectionEl.querySelector('#incoming-more-link');
            if (moreLink) moreLink.onclick = () => renderMyChallenges(document.getElementById('account-modal-content'));
        };

        // Render immediately from the cached list (in-memory, or persisted from
        // a previous visit), then refresh from Firestore in the background. A
        // bad cached render must not block the fresh load below.
        const knownChallenges = myChallengesCache || readChallengesCache()?.items;
        if (knownChallenges) { try { render(knownChallenges); } catch(e) { console.error('Cached render failed:', e); } }

        try {
            const all = await loadAllMyChallenges();
            render(all);
        } catch(e) {
            console.error('Failed to load incoming challenges:', e);
        }
    }

    // Renders either the send-to-username form (player owns a username) or a
    // one-time claim prompt (their display name is unclaimed or owned by someone else).
    async function populateUsernameChallengeSection(sectionEl) {
        // Known username (in-memory or remembered from a previous visit) →
        // render synchronously, no Firestore wait.
        const knownUsername = myUsernameCache || getStoredUsername();
        if (knownUsername) {
            myUsernameCache = knownUsername;
            renderSendToUsername(sectionEl, knownUsername);
            return;
        }

        // A brand-new anonymous player can't own a username yet — skip the
        // lookup and go straight to the claim prompt.
        if (!isUserSignedIn() && !localStorage.getItem('wordRushPlayerName')) {
            renderClaimUsernamePrompt(sectionEl);
            return;
        }

        // Otherwise show a visible loading state while we look it up — this
        // section used to be invisible during the fetch, which read as the
        // form randomly missing on slow connections.
        sectionEl.innerHTML = `
            <div class="flex items-center justify-center gap-2 py-3 text-slate-400 text-xs">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Loading your username...</span>
            </div>`;

        let myUsername = null;
        let silentClaim = null;
        try {
            if (db && userId) {
                const snap = await getDocResilient(doc(db, 'players', userId));
                myUsername = snap.exists() ? snap.data().username : null;
                if (!myUsername) {
                    // Legacy player: try a silent claim of their display name first.
                    const displayName = localStorage.getItem('wordRushPlayerName');
                    if (displayName) {
                        silentClaim = await claimUsername(displayName);
                        if (silentClaim === 'claimed') myUsername = normalizeUsername(displayName);
                    }
                }
            }
        } catch(e) {}
        if (!sectionEl.isConnected) return;

        if (myUsername) {
            storeUsername(myUsername);
            renderSendToUsername(sectionEl, myUsername);
        } else {
            // Only say the name is taken when the claim attempt actually said
            // so — a failed lookup must not accuse the player's own name.
            renderClaimUsernamePrompt(sectionEl, silentClaim === 'taken');
        }
    }

    function renderSendToUsername(sectionEl, myUsername) {
        sectionEl.innerHTML = `
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 text-left">Send to a username</label>
            <div class="flex gap-2">
                <input id="challenge-username-input" type="text" maxlength="15" placeholder="Friend's username"
                    class="auth-input flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <button id="challenge-username-send" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm">Send</button>
            </div>
            <p id="challenge-username-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
            <div class="relative my-2"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div><div class="relative flex justify-center text-xs"><span class="bg-white px-2 text-slate-400 font-semibold">OR</span></div></div>`;

        const inputEl = document.getElementById('challenge-username-input');
        const msgEl = document.getElementById('challenge-username-msg');
        const sendBtn = document.getElementById('challenge-username-send');

        const doSend = async () => {
            const uname = normalizeUsername(inputEl.value);
            if (!uname) return;
            if (uname === myUsername) { setUsernameMsg(msgEl, "That's you! Enter a friend's username.", false); return; }
            if (!validationTrie || !fullDictionaryTrie) { setUsernameMsg(msgEl, 'Dictionaries still loading. Try again in a moment.', false); return; }

            sendBtn.disabled = true;
            msgEl.textContent = 'Searching...';
            msgEl.className = 'text-xs mt-1 text-left text-slate-500 min-h-[16px]';
            try {
                const snap = await withTimeout(getDoc(doc(db, 'usernames', uname)));
                if (!snap.exists()) {
                    setUsernameMsg(msgEl, 'No player found with that username.', false);
                    return;
                }
                if (snap.data().uid === userId) {
                    setUsernameMsg(msgEl, "That's you! Enter a friend's username.", false);
                    return;
                }
                const toUid = snap.data().uid;
                const toName = snap.data().displayName || uname;

                // Reuse an open (unfinished, undeclined) challenge between us —
                // in either direction — instead of stacking up duplicates.
                const now = Date.now();
                const [outgoingSnap, incomingSnap] = await Promise.all([
                    withTimeout(getDocs(query(collection(db, 'challenges'),
                        where('createdBy', '==', userId), where('toUid', '==', toUid), limit(10)))),
                    withTimeout(getDocs(query(collection(db, 'challenges'),
                        where('createdBy', '==', toUid), where('toUid', '==', userId), limit(10))))
                ]);
                const openDocs = [...outgoingSnap.docs, ...incomingSnap.docs].filter(d => {
                    const dd = d.data();
                    if (dd.expiresAt?.toDate && dd.expiresAt.toDate() < now) return false;
                    const myRes = dd.results?.[userId];
                    const theirRes = dd.results?.[toUid];
                    if (myRes?.declined || theirRes?.declined) return false;
                    return !(myRes && theirRes); // finished games get a fresh board
                });
                // Prefer a board that's waiting on us — playing it beats
                // creating yet another one they'd have to answer.
                const open = openDocs.find(d => !d.data().results?.[userId]) || openDocs[0];
                if (open) {
                    // Tell the player why they landed on an existing game instead
                    // of a fresh one — otherwise Send looks broken.
                    goToChallengeScreen(open.id, open.data(), `You already have an open game with ${toName}. Finish it before starting a new one!`);
                    return;
                }

                const created = await createChallengeDoc({ toUid, toName });
                goToChallengeScreen(created.id, created.data);
            } catch(e) {
                console.error('Failed to send username challenge:', e);
                setUsernameMsg(msgEl, 'Something went wrong. Please try again.', false);
            } finally {
                sendBtn.disabled = false;
            }
        };

        sendBtn.onclick = doSend;
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };
    }

    function renderClaimUsernamePrompt(sectionEl, nameKnownTaken = false) {
        const displayName = localStorage.getItem('wordRushPlayerName');
        const takenNote = nameKnownTaken && displayName && isValidUsername(displayName)
            ? `"${escapeHTML(displayName)}" is already taken. Pick another to challenge friends directly:`
            : 'Claim a username so friends can find and challenge you:';

        sectionEl.innerHTML = `
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 text-left">Your username</label>
            <p class="text-xs text-slate-500 mb-2 text-left">${takenNote}</p>
            <div class="flex gap-2">
                <input id="claim-username-input" type="text" maxlength="15" placeholder="Pick a username"
                    class="auth-input flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <button id="claim-username-btn" class="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-lg text-sm">Claim</button>
            </div>
            <p id="claim-username-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
            <div class="relative my-2"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div><div class="relative flex justify-center text-xs"><span class="bg-white px-2 text-slate-400 font-semibold">OR</span></div></div>`;

        const inputEl = document.getElementById('claim-username-input');
        const msgEl = document.getElementById('claim-username-msg');
        attachUsernameCheck(inputEl, msgEl);

        const doClaim = async () => {
            const name = inputEl.value.trim();
            if (!name) return;
            if (!isValidUsername(name)) { setUsernameMsg(msgEl, USERNAME_RULES_MSG, false); return; }
            msgEl.textContent = 'Claiming...';
            msgEl.className = 'text-xs mt-1 text-left text-slate-500 min-h-[16px]';
            const claimStatus = await claimUsername(name);
            if (claimStatus !== 'claimed') {
                setUsernameMsg(msgEl, claimStatus === 'taken' ? 'That username is taken. Try another.'
                    : claimStatus === 'invalid' ? USERNAME_RULES_MSG
                    : "Couldn't claim username. Check your connection and try again.", false);
                return;
            }
            // The claimed username becomes the player's display name too.
            localStorage.setItem('wordRushPlayerName', name);
            try { await setDoc(doc(db, 'players', userId), { name, hasSubmittedName: true }, { merge: true }); } catch(e) {}
            renderSendToUsername(sectionEl, normalizeUsername(name));
        };

        document.getElementById('claim-username-btn').onclick = doClaim;
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') doClaim(); };
    }

    // Generates a fresh board and writes the challenge doc. `extraFields` lets a
    // caller direct the challenge at a specific player (toUid/toName).
    async function createChallengeDoc(extraFields = {}) {
        // Without the dictionaries the validator can't count findable words,
        // so every candidate board "fails" and the fallback ships an unchecked
        // board that both players are stuck with. Refuse instead — every
        // caller already surfaces errors as its normal failure state.
        if (!validationTrie || !fullDictionaryTrie) throw new Error('Dictionaries not loaded yet');
        const board = generateAndValidateBoard();
        // Bonus tiles are rolled once here and stored on the doc so both players
        // start from an identical board, bonuses included.
        const bonuses = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            const b = getBonusTypeNoTime();
            if (b) bonuses.push({ index: i, type: b.type });
        }
        const playerName = localStorage.getItem('wordRushPlayerName') || 'A friend';
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const challengeData = {
            board,
            bonuses,
            createdBy: userId,
            createdByName: playerName,
            createdAt: serverTimestamp(),
            expiresAt,
            results: {},
            // Everyone listed here sees the challenge in My Challenges via one
            // array-contains query; link players add themselves when they open it.
            participants: extraFields.toUid ? [userId, extraFields.toUid] : [userId],
            ...extraFields
        };
        const challengeRef = await addDoc(collection(db, 'challenges'), challengeData);
        // Show the new challenge in My Challenges immediately — no reload.
        seedChallengeIntoCache(challengeRef.id, { ...challengeData,
            createdAt: msToTimestamp(Date.now()),
            expiresAt: msToTimestamp(expiresAt.getTime())
        });

        // Returning the data alongside the id lets callers render the challenge
        // screen immediately instead of re-fetching the doc they just wrote.
        return { id: challengeRef.id, data: challengeData };
    }

    async function _createAndShareChallenge(btnEl, resultEl) {
        if (!validationTrie || !fullDictionaryTrie) {
            resultEl.innerHTML = `<p class="text-sm text-red-500 text-center">Dictionaries still loading. Try again in a moment.</p>`;
            return;
        }

        const origHTML = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Generating...</span>`;

        try {
            const created = await createChallengeDoc();
            const challengeUrl = `${window.location.origin}${window.location.pathname}?c=${created.id}`;

            if (navigator.share) {
                await navigator.share({
                    text: `🐛 I challenge you to a game of Word Worm! Think you can beat me? ${challengeUrl}`,
                });
                goToChallengeScreen(created.id, created.data);
            } else {
                await navigator.clipboard.writeText(challengeUrl);
                btnEl.innerHTML = `Link Copied!`;
                // Brief confirmation the link is on the clipboard, then land on the challenge screen.
                setTimeout(() => goToChallengeScreen(created.id, created.data), 1200);
            }

        } catch(e) {
            if (e.name !== 'AbortError') {
                console.error('Failed to generate challenge:', e);
                resultEl.innerHTML = `<p class="text-sm text-red-500 text-center">Something went wrong. Please try again.</p>`;
            }
        } finally {
            btnEl.disabled = false;
            if (!btnEl.innerHTML.includes('Link Copied')) {
                btnEl.innerHTML = origHTML;
            }
        }
    }

    async function generateAndSaveChallenge() {
        const btn = document.getElementById('generate-challenge-btn');
        const resultEl = document.getElementById('challenge-link-result');
        if (!btn || !resultEl) return;
        await _createAndShareChallenge(btn, resultEl);
    }

    async function renderMyChallenges(container) {
        container.style.maxHeight = '70dvh';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.overflow = 'hidden';

        // Backed by lastKnownChallengeStats (populated by fetchPlayerStats),
        // so this costs nothing extra — no dedicated read for the modal.
        const { wins, losses, ties } = lastKnownChallengeStats;
        const recordIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15.375a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z" clip-rule="evenodd" /></svg>`;
        const recordLine = (wins + losses + ties) > 0
            ? `<p class="text-sm font-bold text-slate-700 mb-3 flex-shrink-0 flex items-center justify-center gap-1.5"><span class="text-amber-500">${recordIcon}</span>${wins}-${losses}-${ties} all-time</p>`
            : '';

        container.innerHTML = `
            <div class="flex items-center mb-2 flex-shrink-0">
                <button id="my-challenges-back" class="text-slate-400 hover:text-slate-700 mr-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                </button>
                <h2 class="text-lg font-bold text-slate-800">My Challenges</h2>
                <button id="close-challenge-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800 ml-auto">&times;</button>
            </div>
            ${recordLine}
            <div id="challenges-list" class="overflow-y-auto flex flex-col gap-2 pr-0.5" style="flex:1;min-height:0">
                <div class="flex justify-center py-4"><svg class="animate-spin h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
            </div>`;

        document.getElementById('my-challenges-back').onclick = () => {
            container.style.maxHeight = '';
            container.style.display = '';
            container.style.flexDirection = '';
            container.style.overflow = '';
            renderCreateChallenge(container);
        };
        document.getElementById('close-challenge-modal').onclick = () => document.getElementById('account-modal').classList.add('hidden');

        const listEl = document.getElementById('challenges-list');

        const IC_PLAY     = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd"/></svg>`;
        const IC_BELL     = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>`;
        const IC_REFRESH  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;
        const IC_X        = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`;
        const iconBtn = (cls, icon, bg, dataAttr = '') =>
            `<button class="${cls} flex items-center justify-center text-white rounded-lg flex-shrink-0" style="width:32px;height:32px;background:${bg}" ${dataAttr}>${icon}</button>`;

        const buildCard = ({ id, data, myResult, otherResults, expired }) => {
            const realOthers = otherResults.filter(([, r]) => r && !r.declined);
            const declinedByOther = otherResults.find(([, r]) => r && r.declined);
            const topOther = [...realOthers].sort((a,b) => b[1].score - a[1].score)[0];
            const myPlayed = !!myResult;
            const friendPlayed = !!topOther;
            const isIncoming = data.toUid === userId;
            const isMine = data.createdBy === userId;
            const friendName = escapeHTML(isIncoming ? (data.createdByName || 'A friend') : data.toName) || null;
            const challengeUrl = `${window.location.origin}${window.location.pathname}?c=${id}`;

            // × removes the card: decline if it's an unplayed incoming challenge,
            // revoke (delete) if the player created it, otherwise hide locally.
            // Once both sides have played, the challenge is done and its result
            // is shared data — no remove button, so a creator can't yank it out
            // from under the friend who already played it.
            const completed = myPlayed && friendPlayed;
            const removeAction = (isIncoming && !myPlayed) ? 'decline' : (isMine ? 'revoke' : 'hide');
            const removeBtn = completed ? '' : `<button class="challenge-remove-btn flex items-center justify-center rounded-lg flex-shrink-0" style="width:32px;height:32px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0" title="Remove" data-id="${id}" data-action="${removeAction}">${IC_X}</button>`;

            let line1, line1Class, line2, borderStyle, btnHtml;

            if (declinedByOther && !friendPlayed && !expired) {
                line1 = `${escapeHTML(data.toName || declinedByOther[1].name || 'Friend')} declined`;
                line1Class = 'text-slate-500';
                line2 = myPlayed ? `Your score: ${myResult.score}` : '';
                borderStyle = 'border:2px solid #ef4444';
                btnHtml = '';
            } else if (!myPlayed && !friendPlayed && !expired) {
                line1 = isIncoming ? `${friendName} challenged you!` : (friendName ? `Waiting for ${friendName}` : 'Waiting for opponent');
                line1Class = isIncoming ? 'text-slate-800 font-semibold' : 'text-slate-500';
                line2 = isIncoming ? 'Play now!' : 'Play first!';
                borderStyle = 'border:2px solid #cbd5e1';
                btnHtml = iconBtn('challenge-play-btn', IC_PLAY, '#22c55e', `data-id="${id}"`);
            } else if (!myPlayed && friendPlayed && !expired) {
                const fname = topOther[1].name ? escapeHTML(topOther[1].name) : (friendName || 'Friend');
                line1 = isIncoming ? `${fname} challenged you!` : `${fname} played`;
                line1Class = 'text-slate-800 font-semibold';
                line2 = 'Your turn to beat it';
                borderStyle = 'border:2px solid #cbd5e1';
                btnHtml = iconBtn('challenge-play-btn', IC_PLAY, '#22c55e', `data-id="${id}"`);
            } else if (myPlayed && !friendPlayed) {
                line1 = friendName ? `Waiting for ${friendName}` : 'You played';
                line1Class = 'text-slate-500';
                line2 = `Your score: ${myResult.score}`;
                borderStyle = 'border:2px solid #cbd5e1';
                btnHtml = iconBtn('challenge-share-btn', IC_BELL, '#94a3b8', `data-url="${challengeUrl}"`);
            } else if (myPlayed && friendPlayed) {
                const fname = escapeHTML(topOther[1].name) || 'Friend';
                const isTie = myResult.score === topOther[1].score;
                const isWin = myResult.score > topOther[1].score;
                line1 = isTie ? `You tied ${fname}` : isWin ? `You beat ${fname}` : `You lost to ${fname}`;
                line1Class = isWin ? 'text-green-700 font-semibold' : 'text-slate-800 font-semibold';
                line2 = `${myResult.score} – ${topOther[1].score}`;
                borderStyle = isTie ? 'border:2px solid #f59e0b' : isWin ? 'border:2px solid #22c55e' : 'border:2px solid #ef4444';
                btnHtml = iconBtn('challenge-rematch-btn', IC_REFRESH, '#818cf8', `data-touid="${topOther[0]}" data-toname="${escapeHTML(topOther[1].name || '')}"`);
            } else {
                line1 = 'Expired';
                line1Class = 'text-slate-400';
                line2 = '';
                borderStyle = 'border:2px solid #e2e8f0';
                btnHtml = '';
            }

            return `
            <div class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white gap-3" style="${borderStyle}">
                <div class="flex flex-col min-w-0">
                    <span class="text-sm font-semibold ${line1Class} truncate">${line1}</span>
                    <span class="text-sm text-slate-400 mt-0.5">${line2 || '&nbsp;'}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    ${removeBtn}
                    ${btnHtml}
                </div>
            </div>`;
        };

        const attachListeners = () => {
            listEl.querySelectorAll('.challenge-play-btn').forEach(btn => {
                btn.onclick = () => {
                    document.getElementById('account-modal').classList.add('hidden');
                    loadAndPlayChallenge(btn.dataset.id);
                };
            });
            listEl.querySelectorAll('.challenge-share-btn').forEach(btn => {
                btn.onclick = async () => {
                    try {
                        if (navigator.share) {
                            await navigator.share({ text: `🐛 Play my Word Worm challenge! ${btn.dataset.url}` });
                        } else {
                            await navigator.clipboard.writeText(btn.dataset.url);
                            // Swap the icon (innerHTML, not textContent — the button is icon-only)
                            // for a checkmark, then restore it.
                            const orig = btn.innerHTML;
                            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;
                            setTimeout(() => { if (btn.isConnected) btn.innerHTML = orig; }, 1500);
                        }
                    } catch(e) {}
                };
            });
            listEl.querySelectorAll('.challenge-rematch-btn').forEach(btn => {
                btn.onclick = async () => {
                    container.style.maxHeight = '';
                    container.style.display = '';
                    container.style.flexDirection = '';
                    container.style.overflow = '';
                    // A rematch targets the same opponent so it lands in their
                    // incoming list; fall back to the create screen if we somehow
                    // don't know who they are.
                    if (!btn.dataset.touid) { renderCreateChallenge(container); return; }
                    btn.disabled = true;
                    try {
                        const created = await createOrReuseRematch(btn.dataset.touid, btn.dataset.toname || 'A friend');
                        goToChallengeScreen(created.id, created.data);
                    } catch(e) {
                        console.error('Failed to create rematch:', e);
                        btn.disabled = false;
                    }
                };
            });
            listEl.querySelectorAll('.challenge-remove-btn').forEach(btn => {
                btn.onclick = async () => {
                    btn.disabled = true;
                    try {
                        if (btn.dataset.action === 'decline') await declineChallenge(btn.dataset.id);
                        else if (btn.dataset.action === 'revoke') await revokeChallenge(btn.dataset.id);
                        else hideChallengeLocally(btn.dataset.id);
                        renderMyChallenges(container);
                    } catch(e) {
                        console.error('Failed to remove challenge:', e);
                        btn.disabled = false;
                    }
                };
            });
        };

        const renderList = (all) => {
            if (!listEl.isConnected) return;
            // Expired challenges and ones this player declined stay out of the list.
            const valid = all.filter(c => !c.expired && !(c.myResult && c.myResult.declined));

            if (valid.length === 0) {
                listEl.innerHTML = `<p class="text-center text-slate-500 text-sm py-6">No challenges yet.</p>`;
                return;
            }

            // Everything shown here counts as seen for notification purposes,
            // so refresh the home-screen dot right away.
            valid.forEach(c => {
                if (!c.myResult) return;
                markChallengeResultsSeen(c.id, c.otherResults.length);
                recordChallengeOutcomeIfNeeded(c.id, c.myResult, c.otherResults);
            });
            updateChallengeNotifDot();

            const visible = valid.slice(0, 4);
            const hidden = valid.slice(4);
            const viewAllBtn = hidden.length > 0
                ? `<div class="border-t border-slate-200 pt-2 text-center"><span id="view-all-challenges" class="text-xs text-slate-500 cursor-pointer hover:text-slate-700">View More (${valid.length})</span></div>`
                : '';
            listEl.innerHTML = visible.map(c => buildCard(c)).join('') + viewAllBtn;
            attachListeners();

            if (hidden.length > 0) {
                document.getElementById('view-all-challenges').onclick = () => {
                    document.getElementById('view-all-challenges').parentElement.outerHTML = hidden.map(c => buildCard(c)).join('');
                    attachListeners();
                };
            }
        };

        // Show the last known list immediately (in-memory, or persisted from a
        // previous visit) and refresh behind it — the spinner only survives for
        // a first-ever open. A bad cached render must not block the fresh load.
        const knownChallenges = myChallengesCache || readChallengesCache()?.items;
        if (knownChallenges) { try { renderList(knownChallenges); } catch(e) { console.error('Cached render failed:', e); } }

        try {
            renderList(await loadAllMyChallenges());
        } catch(e) {
            console.error('Failed to load challenges:', e);
            if (!knownChallenges && listEl.isConnected) {
                listEl.innerHTML = `<p class="text-center text-red-500 text-sm py-6">Failed to load challenges. Check your connection and try again.</p>`;
            }
        }
    }

    // ---- Challenge Accept Screen (opened via ?c=id link) ----

    async function showChallengeAcceptScreen(challengeId, prefetchedData = null, notice = null) {
        modalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div class="flex justify-center py-4"><svg class="animate-spin h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                <p class="text-slate-500 mt-2">Loading challenge...</p>
            </div>`;
        menuContainer.classList.add('hidden');
        messageModal.classList.remove('hidden');

        if (!db || !userId) {
            // Will be called again from onAuthStateChanged once userId is set
            return;
        }

        try {
            let data = prefetchedData;
            if (!data) {
                const snap = await getDocResilient(doc(db, 'challenges', challengeId));
                if (!snap.exists()) {
                    modalContent.innerHTML = `<div class="bg-white rounded-2xl shadow-lg p-6 text-center"><p class="text-slate-700 font-bold mb-4">Challenge not found.</p><button id="challenge-go-home" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2">${HOME_ICON} Return Home</button></div>`;
                    document.getElementById('challenge-go-home').onclick = () => { history.replaceState(null,'',window.location.pathname); pendingChallengeId = null; showWelcomeScreen(); };
                    return;
                }
                data = snap.data();
            }
            const myResult = data.results?.[userId];
            const otherResults = Object.entries(data.results || {}).filter(([uid, r]) => uid !== userId && !r?.declined);

            // A declined result doesn't lock the board — opening the link again lets them play.
            if (myResult && !myResult.declined) {
                recordChallengeOutcomeIfNeeded(challengeId, myResult, otherResults);
                showChallengeResultsScreen(challengeId, data, myResult, otherResults);
                return;
            }

            // Join the challenge: our uid in participants makes it show up in
            // My Challenges on any device via the single array-contains query.
            // localStorage tracks it only until the write lands (e.g. offline).
            if (!(data.participants || []).includes(userId)) {
                const stored = JSON.parse(localStorage.getItem('wordWormChallenges') || '[]');
                if (!stored.includes(challengeId)) { stored.unshift(challengeId); localStorage.setItem('wordWormChallenges', JSON.stringify(stored.slice(0, 20))); }
                updateDoc(doc(db, 'challenges', challengeId), { participants: arrayUnion(userId) })
                    .then(() => {
                        removeLocalChallengeId(challengeId);
                        seedChallengeIntoCache(challengeId, { ...data, participants: [...(data.participants || []), userId] });
                    })
                    .catch(() => {});
            }

            const isSelf = data.createdBy === userId;
            const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>`;
            const logoHeader = `<h1 class="flex items-center justify-center text-2xl font-black text-slate-800 tracking-tighter mb-5"><img src="assets/word-worm-logo-icon.webp" alt="Word Worm Logo" class="w-8 h-8 mr-2" width="32" height="32">Word Worm</h1>`;
            const noticeHTML = notice ? `<div class="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4"><p class="text-xs font-semibold text-amber-700">${escapeHTML(notice)}</p></div>` : '';

            if (isSelf) {
                const topFriend = otherResults.sort((a,b) => b[1].score - a[1].score)[0];
                const oppName = escapeHTML(data.toName) || null;
                const friendStatus = topFriend
                    ? `<p class="text-sm text-slate-600 mb-6"><strong>${escapeHTML(topFriend[1].name)}</strong> scored <strong class="text-slate-800">${topFriend[1].score}</strong>. Can you beat it?</p>`
                    : `<p class="text-sm text-slate-500 mb-6">${oppName ? `${oppName} hasn't played yet.` : `Your friend hasn't played yet.`}</p>`;

                modalContent.innerHTML = `
                    <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
                        ${logoHeader}
                        <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-9 h-9 text-green-600"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" /></svg>
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 mb-2">Your Challenge</h2>
                        ${oppName && !notice ? `<p class="text-slate-500 mb-2">Playing against <strong>${oppName}</strong></p>` : ''}
                        ${noticeHTML}
                        ${friendStatus}
                        <button id="accept-challenge-btn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl text-lg mb-3 flex items-center justify-center gap-2">
                            ${playIcon} Play Now
                        </button>
                        <button id="challenge-go-home" class="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base">${HOME_ICON} Return Home</button>
                    </div>`;
            } else {
                modalContent.innerHTML = `
                    <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
                        ${logoHeader}
                        <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-9 h-9 text-green-600"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 mb-1">You've been challenged!</h2>
                        <p class="text-slate-500 mb-6">by <strong>${escapeHTML(data.createdByName)}</strong></p>
                        ${noticeHTML}
                        ${otherResults.length > 0 ? `<p class="text-sm text-slate-500 mb-4">Their score: <strong>${otherResults[0][1].score}</strong>. Can you beat it?</p>` : ''}
                        <button id="accept-challenge-btn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl text-lg mb-3 flex items-center justify-center gap-2">
                            ${playIcon} Play Now
                        </button>
                        <button id="challenge-go-home" class="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base">${HOME_ICON} Return Home</button>
                    </div>`;
            }

            document.getElementById('accept-challenge-btn').onclick = () => loadAndPlayChallenge(challengeId, data);
            document.getElementById('challenge-go-home').onclick = () => { history.replaceState(null,'',window.location.pathname); pendingChallengeId = null; showWelcomeScreen(); };

        } catch(e) {
            console.error('Error loading challenge:', e);
            modalContent.innerHTML = `<div class="bg-white rounded-2xl shadow-lg p-6 text-center"><p class="text-red-500 mb-4">Failed to load challenge.</p><button id="challenge-go-home" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2">${HOME_ICON} Return Home</button></div>`;
            document.getElementById('challenge-go-home').onclick = () => { history.replaceState(null,'',window.location.pathname); pendingChallengeId = null; showWelcomeScreen(); };
        }
    }

    // The board/bonuses on a challenge never change, so a caller that already
    // has the doc data can pass it in and skip the fetch.
    async function loadAndPlayChallenge(challengeId, prefetchedData = null) {
        try {
            let data = prefetchedData;
            if (!data) {
                const snap = await getDocResilient(doc(db, 'challenges', challengeId));
                if (!snap.exists()) { showGameMessage('Challenge not found.', 'error'); return; }
                data = snap.data();
            }
            currentChallengeId = challengeId;
            history.replaceState(null,'',window.location.pathname);
            pendingChallengeId = null;
            // Older challenge docs have no stored bonuses — play those with none
            // rather than rolling different random bonuses per player.
            await startGame(false, 'challenge', { board: data.board, bonuses: data.bonuses || [] });
        } catch(e) {
            console.error('Failed to load challenge board:', e);
            showGameMessage('Failed to load challenge.', 'error');
        }
    }

    // ---- Challenge End Screen ----

    async function showChallengeEndScreen(stats) {
        endGameModal.classList.remove('hidden');
        endGameModalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
                <h2 class="text-2xl font-black text-green-500">Challenge Complete!</h2>
                <p class="text-slate-600 my-4">Saving your score...</p>
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            </div>`;

        if (activeGridEl) activeGridEl.style.pointerEvents = 'none';

        // Resolve player name
        let playerName = localStorage.getItem('wordRushPlayerName');
        if (!playerName && db && userId) {
            try {
                const playerSnap = await getDocResilient(doc(db, 'players', userId));
                if (playerSnap.exists() && playerSnap.data().hasSubmittedName) {
                    playerName = playerSnap.data().name;
                    localStorage.setItem('wordRushPlayerName', playerName);
                }
            } catch(e) {}
        }

        const needsName = !playerName;

        // Save result to Firestore
        if (needsName) {
            showChallengeNamePrompt(stats);
        } else if (db && userId && currentChallengeId) {
            await saveAndShowChallengeResult(stats, playerName);
        } else {
            // Can't save (Firebase unavailable or challenge id lost) — never
            // strand the player on the "Saving your score..." spinner.
            showChallengeSaveFailedScreen(stats, playerName);
        }
    }

    // Shown when a challenge score couldn't be written. Being upfront about the
    // failure beats a "Waiting for your friend" screen that implies it saved.
    function showChallengeSaveFailedScreen(stats, playerName) {
        endGameModal.classList.remove('hidden');
        messageModal.classList.add('hidden');
        const canRetry = !!(db && userId && currentChallengeId && playerName);
        endGameModalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
                <h2 class="text-2xl font-black text-green-500">Challenge Complete!</h2>
                <p class="text-5xl font-black text-slate-800 my-4">${stats.score}</p>
                <div class="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                    <p class="text-sm font-semibold text-red-500">Your score couldn't be saved. Check your connection${canRetry ? ' and try again' : ''}.</p>
                </div>
                ${canRetry ? `<button id="challenge-retry-save" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base mb-2">Try Again</button>` : ''}
                <button id="challenge-return-home" class="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base">${HOME_ICON} Return Home</button>
            </div>`;

        const retryBtn = document.getElementById('challenge-retry-save');
        if (retryBtn) {
            retryBtn.onclick = async () => {
                retryBtn.disabled = true;
                retryBtn.textContent = 'Saving...';
                await saveAndShowChallengeResult(stats, playerName);
            };
        }
        document.getElementById('challenge-return-home').onclick = () => { currentChallengeId = null; resetGame(); };
    }

    async function saveAndShowChallengeResult(stats, playerName) {
        const resultData = {
            name: playerName,
            score: stats.score,
            foundWords: stats.foundWords.map(fw => fw.word || fw),
            completedAt: serverTimestamp()
        };
        const finishedChallengeId = currentChallengeId;

        try {
            // Writes have no client-side deadline either — cap the wait so a
            // stalled connection lands on the retry screen instead of leaving
            // the player on the "Saving your score..." spinner forever.
            await withTimeout(updateDoc(doc(db, 'challenges', finishedChallengeId), {
                [`results.${userId}`]: resultData
            }), 15000);
        } catch(e) {
            console.error('Failed to save challenge result:', e);
            showChallengeSaveFailedScreen(stats, playerName);
            return;
        }

        // The score is saved. Nothing below may strand the player on the
        // spinner or claim the save failed.
        try {
            mutateChallengesCache(entries => entries.map(([id, data]) => id === finishedChallengeId
                ? [id, { ...data, results: { ...(data.results || {}), [userId]: { ...resultData, completedAt: null } } }]
                : [id, data]));
        } catch(e) {}
        await withTimeout(updatePlayStreak(userId)).catch(() => {});

        // Re-fetch only to show the opponent's result; without it the screen
        // still renders fine as "waiting for your friend".
        let data = null;
        try {
            const snap = await getDocResilient(doc(db, 'challenges', finishedChallengeId));
            if (snap.exists()) data = snap.data();
        } catch(e) {}

        const myResult = { ...resultData, score: stats.score };
        const otherResults = Object.entries(data?.results || {}).filter(([uid]) => uid !== userId);
        recordChallengeOutcomeIfNeeded(finishedChallengeId, myResult, otherResults);
        showChallengeResultsScreen(finishedChallengeId, data, myResult, otherResults, true);
    }

    function showChallengeNamePrompt(stats) {
        endGameModalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
                <h2 class="text-2xl font-black text-green-500">Challenge Complete!</h2>
                <p class="text-5xl font-black text-slate-800 my-4">${stats.score}</p>
                <p class="text-slate-600 mb-4">Enter a username to save your score:</p>
                <div class="flex gap-2">
                    <input id="challenge-name-input" type="text" maxlength="15" placeholder="Your username"
                        class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-400">
                    <button id="challenge-name-submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Save</button>
                </div>
                <p id="challenge-name-msg" class="text-xs mt-1 mb-2 text-left min-h-[16px]"></p>
                <button id="challenge-create-account" class="text-xs text-green-500 hover:underline flex items-center justify-center gap-1 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
                    Sign up to save stats across devices
                </button>
            </div>`;

        const doSave = async (name) => {
            unsubscribe(); // a sign-up later in the session must not re-save this result
            localStorage.setItem('wordRushPlayerName', name);
            if (db && userId) {
                try { await setDoc(doc(db, 'players', userId), { name, hasSubmittedName: true }, { merge: true }); } catch(e) {}
            }
            claimUsername(name);
            await saveAndShowChallengeResult(stats, name);
        };

        attachUsernameCheck(document.getElementById('challenge-name-input'), document.getElementById('challenge-name-msg'));
        const submitTypedChallengeName = async () => {
            const name = (document.getElementById('challenge-name-input').value || '').trim().slice(0, 15);
            if (!name) return;
            if (!(await validateNewUsername(name, document.getElementById('challenge-name-msg')))) return;
            await doSave(name);
        };
        document.getElementById('challenge-name-submit').onclick = submitTypedChallengeName;
        document.getElementById('challenge-name-input').onkeydown = (e) => { if (e.key === 'Enter') submitTypedChallengeName(); };
        document.getElementById('challenge-create-account').onclick = () => showAccountModal();

        // Auto-save if the user completes sign-up via the account modal — but
        // only on a fresh anonymous → signed-in transition (the listener fires
        // immediately with the current user), and only while this prompt is
        // still on screen.
        const wasSignedInAtPrompt = isUserSignedIn();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user || user.isAnonymous || wasSignedInAtPrompt) return;
            unsubscribe();
            if (!document.getElementById('challenge-name-input')) return;
            const name = localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player';
            await doSave(name);
        });
    }

    function showChallengeResultsScreen(challengeId, data, myResult, otherResults, isNewSubmission = false) {
        endGameModal.classList.remove('hidden');
        messageModal.classList.add('hidden');
        if (challengeId) markChallengeResultsSeen(challengeId, otherResults.length);
        const declinedOther = otherResults.find(([, r]) => r && r.declined);
        const topOther = otherResults.filter(([, r]) => r && !r.declined).sort((a,b) => b[1].score - a[1].score)[0];
        const homeIcon = HOME_ICON;
        const refreshIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;

        let comparisonHTML;
        if (topOther) {
            const tie = myResult.score === topOther[1].score;
            const won = myResult.score > topOther[1].score;
            const lost = !won && !tie;
            const tieBadge = '<div class="text-xs font-bold text-amber-700 mt-1">Tie!</div>';
            comparisonHTML = `
                <div class="flex gap-3 mt-4 mb-4">
                    <div class="flex-1 bg-${won ? 'green' : 'slate'}-50 border border-${won ? 'green' : 'slate'}-200 rounded-xl p-3 text-center">
                        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">You</div>
                        <div class="text-3xl font-black text-slate-800">${myResult.score}</div>
                        ${won ? '<div class="text-xs font-bold text-green-600 mt-1">Winner!</div>' : tie ? tieBadge : ''}
                    </div>
                    <div class="flex items-center text-slate-400 font-bold text-lg">vs</div>
                    <div class="flex-1 bg-${lost ? 'green' : 'slate'}-50 border border-${lost ? 'green' : 'slate'}-200 rounded-xl p-3 text-center">
                        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">${escapeHTML(topOther[1].name)}</div>
                        <div class="text-3xl font-black text-slate-800">${topOther[1].score}</div>
                        ${lost ? '<div class="text-xs font-bold text-green-600 mt-1">Winner!</div>' : tie ? tieBadge : ''}
                    </div>
                </div>`;
        } else {
            const waitName = escapeHTML((data && (data.createdBy === userId ? data.toName : data.createdByName)) || 'your friend');
            const statusHTML = declinedOther
                ? `<div class="bg-red-50 border border-red-200 rounded-xl p-3">
                        <p class="text-sm font-semibold text-red-500">${escapeHTML((data && data.toName) || declinedOther[1].name || 'Your friend')} declined this challenge.</p>
                    </div>`
                : `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p class="text-sm font-semibold text-amber-700">Waiting for ${waitName} to play...</p>
                    </div>`;
            comparisonHTML = `
                <div class="my-4">
                    <p class="text-5xl font-black text-slate-800 mb-2">${myResult.score}</p>
                    ${statusHTML}
                </div>`;
        }

        const buttonsHTML = topOther ? `
                <div id="rematch-result" class="mb-2"></div>
                <button id="challenge-rematch-btn" class="w-full text-white font-bold py-3 px-4 rounded-lg text-base mb-2 flex items-center justify-center gap-2">
                    ${refreshIcon} Rematch
                </button>
                <button id="challenge-return-home" class="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base">
                    ${homeIcon} Return Home
                </button>` : `
                <button id="challenge-return-home" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2">
                    ${homeIcon} Return Home
                </button>`;

        endGameModalContent.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 text-center w-full max-w-sm mx-auto modal-enter">
                <h2 class="text-2xl font-black text-green-500">Challenge ${topOther ? 'Results' : 'Complete!'}</h2>
                ${comparisonHTML}
                ${buttonsHTML}
            </div>`;

        if (isNewSubmission) triggerEndGameConfetti(endGameModalContent.querySelector('div'));

        if (topOther) {
            document.getElementById('challenge-rematch-btn').onclick = async () => {
                const rematchBtn = document.getElementById('challenge-rematch-btn');
                const rematchResult = document.getElementById('rematch-result');
                rematchBtn.disabled = true;
                rematchBtn.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Setting up rematch...</span>`;
                try {
                    // Rematch goes straight back at the same opponent, reusing
                    // an already-open challenge with them if one exists.
                    const created = await createOrReuseRematch(topOther[0], topOther[1].name || 'A friend');
                    goToChallengeScreen(created.id, created.data);
                } catch(e) {
                    console.error('Failed to create rematch:', e);
                    rematchBtn.disabled = false;
                    rematchBtn.innerHTML = `${refreshIcon} Rematch`;
                    if (rematchResult) rematchResult.innerHTML = `<p class="text-sm text-red-500 text-center">Something went wrong. Please try again.</p>`;
                }
            };
        }
        document.getElementById('challenge-return-home').onclick = () => { currentChallengeId = null; resetGame(); };
    }

    function showAccountModal(initialTab = 'login') {
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
                    <p class="text-lg font-black text-slate-800">${escapeHTML(playerName)}</p>
                    <p class="text-xs text-slate-500 mt-1">High Score: ${highScore} &bull; Streak: ${streak} days</p>
                </div>
                <button id="account-signout-btn" class="w-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg text-base shadow-md transition-colors border border-slate-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2 text-red-400"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                    Sign Out
                </button>`;

            document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
            document.getElementById('account-signout-btn').onclick = async () => {
                await signOutAndReset();
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
                // Shows an error in place, without rebuilding the form — a rebuild
                // would wipe whatever the user has typed. Optionally restores a
                // button that was put into its busy/spinner state.
                const showAuthError = (msg, btn = null, btnHTML = '') => {
                    const el = document.getElementById('auth-error');
                    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
                    if (btn) { btn.disabled = false; btn.innerHTML = btnHTML; }
                };
                // Closing the provider popup is a deliberate cancel, not a failure.
                const isPopupCancelled = (e) => ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(e?.code);
                const authErrorEl = `<p id="auth-error" class="text-xs text-red-500 mb-3${errorMsg ? '' : ' hidden'}">${errorMsg}</p>`;

                if (activeTab === 'login') {
                    // Logging in (unlike signing up, which links the current account)
                    // switches to a different account, leaving any guest progress on
                    // this device behind — warn players who have some.
                    const guestNote = (auth?.currentUser?.isAnonymous && localStorage.getItem('wordRushPlayerName'))
                        ? `<p class="text-xs text-slate-400 mt-3 text-center">Heads up: scores saved as a guest on this device won't carry over when you log in to an existing account. To keep them, use Sign Up instead.</p>`
                        : '';
                    accountModalContent.innerHTML = `
                        ${viewHeader('Log In')}
                        ${authErrorEl}
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
                        </p>
                        ${guestNote}`;

                    document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('goto-signup').onclick = () => renderAuthModal('signup');
                    document.getElementById('login-guest-btn').onclick = () => accountModal.classList.add('hidden');
                    document.getElementById('forgot-password-link').onclick = () => renderForgotPasswordView();
                    document.getElementById('login-google-btn').onclick = async () => {
                        const btn = document.getElementById('login-google-btn');
                        const btnHTML = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Signing in...</div>`;
                        try {
                            const { isNewUser, suggestedName } = await signInWithProvider(new GoogleAuthProvider());
                            if (isNewUser) {
                                renderNamePromptView(suggestedName);
                            } else {
                                accountModal.classList.add('hidden');
                                showWelcomeScreen();
                            }
                        } catch (e) {
                            if (isPopupCancelled(e)) { btn.disabled = false; btn.innerHTML = btnHTML; return; }
                            console.error('Google sign-in failed:', e);
                            showAuthError('Sign-in failed. Please try again.', btn, btnHTML);
                        }
                    };
                    document.getElementById('login-submit-btn').onclick = async () => {
                        const email = document.getElementById('login-email').value.trim();
                        const password = document.getElementById('login-password').value;
                        if (!email) { showAuthError('Please enter your email address.'); return; }
                        if (!password) { showAuthError('Please enter your password.'); return; }
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
                            showAuthError(msg, btn, 'Log In');
                        }
                    };
                } else {
                    // Prefill only if the saved name already satisfies the username
                    // rules — this field claims the player's unique username, so it
                    // uses the same 2–15 char [a-z0-9_-] rules as everywhere else.
                    const savedNameRaw = (localStorage.getItem('wordRushPlayerName') || '').trim();
                    const prefillName = isValidUsername(savedNameRaw) ? escapeHTML(savedNameRaw) : '';
                    accountModalContent.innerHTML = `
                        ${viewHeader('Sign Up')}
                        ${authErrorEl}
                        <div class="space-y-3">
                            <div>
                                <label class="${labelClass}">Username</label>
                                <input id="create-name" type="text" value="${prefillName}" placeholder="${USERNAME_RULES_MSG}" maxlength="15" class="${inputClass}">
                                <p id="create-name-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
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
                    attachUsernameCheck(document.getElementById('create-name'), document.getElementById('create-name-msg'));
                    document.getElementById('signup-google-btn').onclick = async () => {
                        const btn = document.getElementById('signup-google-btn');
                        const btnHTML = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Signing in...</div>`;
                        try {
                            const { isNewUser, suggestedName } = await signInWithProvider(new GoogleAuthProvider());
                            if (isNewUser) {
                                renderNamePromptView(suggestedName);
                            } else {
                                accountModal.classList.add('hidden');
                                showWelcomeScreen();
                            }
                        } catch (e) {
                            if (isPopupCancelled(e)) { btn.disabled = false; btn.innerHTML = btnHTML; return; }
                            console.error('Google sign-in failed:', e);
                            showAuthError('Sign-in failed. Please try again.', btn, btnHTML);
                        }
                    };
                    document.getElementById('create-submit-btn').onclick = async () => {
                        const name = document.getElementById('create-name').value.trim();
                        const email = document.getElementById('create-email').value.trim();
                        const password = document.getElementById('create-password').value;
                        if (!name) { showAuthError('Please enter a username.'); return; }
                        if (!isValidUsername(name)) { showAuthError(USERNAME_RULES_MSG); return; }
                        if (!email) { showAuthError('Please enter an email address.'); return; }
                        if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
                        const btn = document.getElementById('create-submit-btn');
                        btn.disabled = true;
                        btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Creating account...</div>`;
                        // Confirm the username is free before creating the account,
                        // so nobody ends up with an account but no claimable name.
                        if (!(await validateNewUsername(name, document.getElementById('create-name-msg')))) {
                            btn.disabled = false;
                            btn.innerHTML = 'Create Account';
                            return;
                        }
                        try {
                            const credential = EmailAuthProvider.credential(email, password);
                            const result = await linkWithCredential(auth.currentUser, credential);
                            userId = result.user.uid;
                            if (db) {
                                await setDoc(doc(db, "players", result.user.uid), { name, hasSubmittedName: true }, { merge: true });
                                localStorage.setItem('wordRushPlayerName', name);
                                await claimUsername(name);
                            }
                            accountModal.classList.add('hidden');
                            showWelcomeScreen();
                        } catch (e) {
                            console.error('Account creation failed:', e);
                            const msg = e.code === 'auth/email-already-in-use' ? 'That email is already in use.'
                                : e.code === 'auth/invalid-email' ? 'Please enter a valid email address.'
                                : 'Something went wrong. Please try again.';
                            showAuthError(msg, btn, 'Create Account');
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

            const renderNamePromptView = (suggestedName) => {
                // Suggested names come from the Google profile — sanitize down to
                // the username charset so the prefill is always claimable as-is.
                const sanitizedSuggestion = (suggestedName || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 15);
                accountModalContent.innerHTML = `
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-slate-800">Choose your username</h2>
                        <button id="close-account-modal" class="text-3xl leading-none text-slate-400 hover:text-slate-800">&times;</button>
                    </div>
                    <p class="text-sm text-slate-500 mb-5">This is how you'll appear on the leaderboard and how friends can find and challenge you. You can change it later in your profile.</p>
                    <div id="name-prompt-error" class="hidden text-xs text-red-500 mb-3"></div>
                    <div class="space-y-4">
                        <div>
                            <label class="${labelClass}">Username</label>
                            <input id="name-prompt-input" type="text" value="${escapeHTML(sanitizedSuggestion)}" placeholder="${USERNAME_RULES_MSG}" maxlength="15" class="${inputClass}" autofocus>
                            <p id="name-prompt-msg" class="text-xs mt-1 text-left min-h-[16px]"></p>
                        </div>
                        <button id="name-prompt-submit" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors">
                            Let's Play!
                        </button>
                    </div>`;

                document.getElementById('close-account-modal').onclick = () => accountModal.classList.add('hidden');
                const input = document.getElementById('name-prompt-input');
                attachUsernameCheck(input, document.getElementById('name-prompt-msg'));
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);

                document.getElementById('name-prompt-submit').onclick = async () => {
                    const name = input.value.trim();
                    const errorEl = document.getElementById('name-prompt-error');
                    errorEl.classList.add('hidden');
                    if (!isValidUsername(name)) {
                        errorEl.textContent = USERNAME_RULES_MSG;
                        errorEl.classList.remove('hidden');
                        return;
                    }
                    const btn = document.getElementById('name-prompt-submit');
                    btn.disabled = true;
                    btn.innerHTML = `<div class="flex items-center justify-center">${spinnerHtml}Saving...</div>`;
                    if (!(await validateNewUsername(name, document.getElementById('name-prompt-msg')))) {
                        btn.disabled = false;
                        btn.textContent = "Let's Play!";
                        return;
                    }
                    try {
                        if (db && auth.currentUser) {
                            await setDoc(doc(db, "players", auth.currentUser.uid), { name, hasSubmittedName: true }, { merge: true });
                        }
                        localStorage.setItem('wordRushPlayerName', name);
                        claimUsername(name);
                        accountModal.classList.add('hidden');
                        showWelcomeScreen();
                    } catch (e) {
                        console.error('Failed to save display name:', e);
                        btn.disabled = false;
                        btn.textContent = "Let's Play!";
                        errorEl.textContent = 'Something went wrong. Please try again.';
                        errorEl.classList.remove('hidden');
                    }
                };
            };

            renderAuthModal(initialTab);
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
                <button id="challenge-tab" class="tab-button flex-1 py-1 px-2 rounded-md font-semibold text-sm transition-colors duration-200">Puzzle</button>
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

        const inputCls = 'auth-input w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
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

            const savedName = localStorage.getItem('wordRushPlayerName');

            let body;
            {
                const playerName = signedIn
                    ? (localStorage.getItem('wordRushPlayerName') || user.displayName?.split(' ')[0] || 'Player')
                    : (savedName || '');
                const isEmailUser = signedIn && user.providerData?.some(p => p.providerId === 'password');
                const isGoogleUser = signedIn && user.providerData?.some(p => p.providerId === 'google.com');

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
                    </div>` : !signedIn ? `
                    <div class="border-t border-slate-100 pt-4">
                        <p class="text-xs text-slate-500 mb-2">Your scores are only saved on this device. Add an email to sync your stats everywhere.</p>
                        <button id="profile-add-email-btn" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">Add Email</button>
                    </div>` : '';

                const emailSection = (signedIn && user.email) ? `
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                        <p class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">${user.email.replace(/</g, '&lt;')}</p>
                    </div>` : '';

                const signOutSection = signedIn ? `
                    <div class="border-t border-slate-100 pt-4">
                        <button id="profile-signout-btn" class="w-full flex items-center justify-center text-red-500 hover:text-red-700 font-semibold py-2.5 px-4 rounded-lg text-sm border border-red-200 hover:border-red-300 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                            Sign Out
                        </button>
                    </div>` : '';

                body = `<div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Username</label>
                        <div class="flex gap-2">
                            <input id="profile-username" type="text" value="${playerName.replace(/"/g, '&quot;')}" placeholder="Choose a username" maxlength="15" class="${inputCls} flex-1">
                            <button id="save-username-btn" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-sm transition-colors whitespace-nowrap">Save</button>
                        </div>
                        <p id="username-msg" class="text-xs mt-1 min-h-[16px]"></p>
                    </div>
                    ${emailSection}
                    ${providerSection}
                    ${signOutSection}
                </div>`;
            }

            statsModalContent.innerHTML = wrapModal(body);
            attachShared();

            {
                attachUsernameCheck(document.getElementById('profile-username'), document.getElementById('username-msg'));
                document.getElementById('save-username-btn').onclick = async () => {
                    const newName = document.getElementById('profile-username').value.trim();
                    const msgEl = document.getElementById('username-msg');
                    if (!newName) {
                        msgEl.textContent = 'Name cannot be empty.';
                        msgEl.className = 'text-xs mt-1 text-red-500 min-h-[16px]';
                        return;
                    }
                    if (!isValidUsername(newName)) {
                        setUsernameMsg(msgEl, USERNAME_RULES_MSG, false);
                        return;
                    }
                    msgEl.textContent = 'Checking...';
                    msgEl.className = 'text-xs mt-1 text-slate-500 min-h-[16px]';
                    const claimStatus = await claimUsername(newName);
                    if (claimStatus !== 'claimed') {
                        setUsernameMsg(msgEl, claimStatus === 'taken' ? 'That username is taken. Try another.'
                            : claimStatus === 'invalid' ? USERNAME_RULES_MSG
                            : "Couldn't save. Check your connection and try again.", false);
                        return;
                    }
                    try {
                        localStorage.setItem('wordRushPlayerName', newName);
                        await updateProfile(auth.currentUser, { displayName: newName });
                        if (db && userId) {
                            await setDoc(doc(db, 'players', userId), { name: newName, hasSubmittedName: true }, { merge: true });
                        }
                        const greetingEl = document.getElementById('player-greeting');
                        if (greetingEl) greetingEl.innerHTML = signedIn
                            ? `Welcome back, <strong class="font-bold">${escapeHTML(newName)}</strong>! 👋`
                            : `Welcome back, <strong class="font-bold">${escapeHTML(newName)}</strong>! 👋 &bull; <span id="greeting-signin-link" class="text-blue-500 hover:underline cursor-pointer">Add email</span>`;
                        if (!signedIn) {
                            setTimeout(() => {
                                const link = document.getElementById('greeting-signin-link');
                                if (link) link.onclick = () => showAccountModal('signup');
                            }, 0);
                        }
                        msgEl.textContent = 'Saved!';
                        msgEl.className = 'text-xs mt-1 text-green-600 min-h-[16px]';
                        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
                    } catch (e) {
                        msgEl.textContent = 'Failed to save. Try again.';
                        msgEl.className = 'text-xs mt-1 text-red-500 min-h-[16px]';
                    }
                };

                if (!signedIn) {
                    const addEmailBtn = document.getElementById('profile-add-email-btn');
                    if (addEmailBtn) {
                        addEmailBtn.onclick = () => {
                            statsModal.classList.add('hidden');
                            showAccountModal('signup');
                        };
                    }
                }

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

                const signOutBtn = document.getElementById('profile-signout-btn');
                if (signOutBtn) {
                    signOutBtn.onclick = async () => {
                        await signOutAndReset();
                        statsModal.classList.add('hidden');
                        showWelcomeScreen();
                    };
                }
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
    
 // Leaderboards change slowly, so reuse the last render for a minute — tab
 // flips and quick re-opens are instant instead of a Firestore read each time.
 const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;
 const leaderboardHtmlCache = {};

 async function fetchAndDisplayLeaderboard(type, listElement, loadingElement) {
    if (!listElement) return;
    const cached = leaderboardHtmlCache[type];
    if (cached && Date.now() - cached.at < LEADERBOARD_CACHE_TTL_MS) {
        listElement.innerHTML = cached.html;
        if (loadingElement) loadingElement.style.display = 'none';
        return;
    }
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
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const leaderboardRef = doc(db, "leaderboards", "dailyChallenge");
            const docSnap = await getDocResilient(leaderboardRef);

            if (!docSnap.exists() || docSnap.data().date !== todayStr || !docSnap.data().topScores || docSnap.data().topScores.length === 0) {
                html += `<p class="text-slate-500 text-center text-sm p-2">No scores yet for today's puzzle. Be the first!</p>`;
            } else {
                html += `<h3 class="text-lg font-bold text-slate-800 my-2 sticky top-0 bg-white py-1 flex items-center gap-2">${icons.highScore} Score / Words Found</h3>`;
                const players = docSnap.data().topScores;
                const scores = players.map((player, i) => {
                    const isCurrentUser = player.userID === userId;
                    return `
                        <li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}">
                            <span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span>
                            <span class="font-semibold text-slate-800 flex-grow truncate mr-4">${escapeHTML(player.name)}</span>
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
            const docSnap = await getDocResilient(leaderboardRef);
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
                            return `<li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}"><span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span><span class="font-semibold text-slate-800 flex-grow truncate mr-4">${escapeHTML(player.name)}</span><span class="font-bold text-green-500">${value}</span></li>`;
                        }).join('');
                        html += `<ol class="space-y-1">${scores}</ol>`;
                    }
                }
            }
        } else { // ✅ FIX: This is the corrected logic for the timed 'daily' leaderboard
            const leaderboardRef = doc(db, "leaderboards", "daily");
            const docSnap = await getDocResilient(leaderboardRef);
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
                            return `<li class="flex items-center p-2 rounded-lg ${isCurrentUser ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-slate-50' : '')}"><span class="font-bold text-slate-500 w-8 text-center">${i + 1}.</span><span class="font-semibold text-slate-800 flex-grow truncate mr-4">${escapeHTML(player.name)}</span><span class="font-bold text-green-500">${value}</span></li>`;
                        }).join('');
                        html += `<ol class="space-y-1">${scores}</ol>`;
                    }
                }
            }
        }
        listElement.innerHTML = html;
        leaderboardHtmlCache[type] = { at: Date.now(), html };
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

    // The board is hidden while paused so pausing can't be used to study the grid.
    const setBoardHidden = (hidden) => {
        if (activeGridEl) activeGridEl.style.visibility = hidden ? 'hidden' : 'visible';
    };

    const resumeGame = () => {
        pauseModal.classList.add('hidden');
        setBoardHidden(false);
        if (currentGamemode !== 'daily' && (isPracticeMode || timer > 0)) {
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

            // 'New Game' only makes sense for standard/practice boards — daily and
            // friend-challenge boards are fixed.
            restartButton.classList.toggle('hidden', currentGamemode === 'daily' || currentGamemode === 'challenge');

            setBoardHidden(true);
            pauseModal.classList.remove('hidden');
        }
    });

    resumeButton.addEventListener('click', resumeGame);
    closePauseButton.addEventListener('click', resumeGame);
    restartButton.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        setBoardHidden(false);
        startGame(isPracticeMode, currentGamemode);
    });
    quitButton.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        setBoardHidden(false);
        // Quitting a friend challenge mid-game leaves it unplayed, so it can be
        // picked back up later from My Challenges.
        currentChallengeId = null;
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

    // Still hold the line on the structural rules, which need no dictionary.
    // The full validator finds zero words when it runs before the dictionaries
    // load, so every attempt above "fails" — a raw random board here is how
    // 2×2 all-consonant clumps shipped in challenge games.
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let board = existingBoard ? [...existingBoard] : new Array(GRID_SIZE).fill(null);
        board.forEach((tile, index) => {
            if (tile === null) board[index] = getRandomLetter();
        });
        if (isBoardStructurallySound(board)) return board;
    }

    let fallbackBoard = existingBoard ? [...existingBoard] : new Array(GRID_SIZE).fill(null);
    fallbackBoard.forEach((tile, index) => {
        if (tile === null) fallbackBoard[index] = getRandomLetter();
    });
    return fallbackBoard;
}
    
   // The board rules that need no dictionary: 4-7 vowels, ≤1 hard consonant,
   // Q adjacent to U, no 2×2 all-vowel/all-consonant clumps. Split out so the
   // generation fallback can enforce them even when word-count checks can't run.
   function isBoardStructurallySound(board) {
    const vowelCount = board.filter(letter => VOWELS.includes(letter)).length;
    if (vowelCount < 4 || vowelCount > 7) return false;

    const hardConsonantCount = board.filter(letter => HARD_CONSONANTS.includes(letter)).length;
    if (hardConsonantCount > 1) return false;

    const qIndex = board.indexOf("Q");
    if (qIndex !== -1 && !getNeighbors(qIndex, board).some(letter => letter === "U")) {
        return false;
    }

    return checkNoClumps(board);
}

   function isBoardPlayable(board) {
    if (!isBoardStructurallySound(board)) return false;

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

    // Spoiler-free, Wordle-style share text for the daily puzzle. Uses the passed
   // stats (not live game state) so sharing a past result works too.
   async function shareDailyResult(stats) {
        const nyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const dateStr = `${nyNow.getMonth() + 1}/${nyNow.getDate()}`;
        const pct = stats.totalCount > 0 ? Math.round((stats.foundCount / stats.totalCount) * 100) : 0;
        const greens = Math.round(pct / 10);
        const bar = '🟩'.repeat(greens) + '⬜'.repeat(10 - greens);

        let shareText = `Word Worm Daily Puzzle ${dateStr} 🐛\n`;
        shareText += `${stats.score} pts · ${stats.foundCount}/${stats.totalCount} words\n`;
        shareText += `${bar} ${pct}%\n`;
        if (lastKnownStreak > 1) shareText += `🔥 ${lastKnownStreak}-day streak\n`;
        shareText += `https://wordwormgame.com/`;

        if (navigator.share) {
            try { await navigator.share({ title: 'Word Worm', text: shareText }); } catch (err) { if (err.name !== 'AbortError') console.error('Share failed:', err); }
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
            } catch (err) { console.error('Failed to copy: ', err); }
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
        const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>`;
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
        const standardMessage = `Score submitted as&nbsp;<strong>${escapeHTML(playerName)}</strong>!`;
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
            if (!tile) return false;
            if (i > 0) {
                const prevTile = document.getElementById(`tut-tile-${sequence[i-1].index}`);
                if (!prevTile) return false;
                drawLine(prevTile, tile);
                await new Promise(r => setTimeout(r, 100));
            }
            tile.classList.add('highlight');
            wordBuilderEl.innerHTML += `<span class="bg-white dark:bg-slate-300 text-blue-500 dark:text-blue-700 font-bold text-sm p-0.5 rounded-md shadow-sm">${step.letter}</span>`;
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
                                    <strong class="font-semibold text-slate-800 text-sm">Daily Puzzle Mode:</strong>
                                    <p class="mt-1.5 text-slate-900 text-sm">The Daily Puzzle is a static board that resets every day. Find as many words as you can, then hit <span class="font-semibold">Submit</span> when done to be added to the leaderboard!</p>
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

    // Haptics rows: hidden on devices without vibration support (e.g. desktop).
    if (hapticsSupported) {
        setHaptics(hapticsEnabled());
        document.getElementById('settings-haptics-row').addEventListener('click', () => setHaptics(!hapticsEnabled()));
        document.getElementById('pause-haptics-row').addEventListener('click', () => setHaptics(!hapticsEnabled()));
    } else {
        document.querySelectorAll('#settings-haptics-row, #pause-haptics-row').forEach(el => { el.style.display = 'none'; });
    }

    document.addEventListener('DOMContentLoaded', main);
