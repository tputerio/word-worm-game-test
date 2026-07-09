const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

initializeApp();

// --- Constants & Helper Code ---
const GRID_SIZE = 16, GRID_COLS = 4;
const VOWELS = ['A', 'E', 'I', 'O', 'U'], HARD_CONSONANTS = ['J', 'K', 'Q', 'X', 'Z'];
const LETTER_BAG_STRING = "EEEEEEEEEEEEAAAAAAAAAARRRRRRRRRRIIIIIIIIIOOOOOOOOTTTTTTTTNNNNNNNNSSSSSSSLLLLLLUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";

class Trie {
    constructor(data = null) { this.root = data || {}; }
    search(word, isPrefix = false) {
        let node = this.root;
        for (const char of word) {
            if (!node[char]) return false;
            node = node[char];
        }
        return isPrefix ? true : node.isEndOfWord === true;
    }
}
let fullDictionaryTrie;
let commonDictionaryTrie;

function findWordsRecursive(tileIndex, prefix, path, foundWordsSet, board, trie) {
    prefix += board[tileIndex];
    if (!trie.search(prefix, true)) return;
    if (prefix.length >= 3 && trie.search(prefix)) foundWordsSet.add(prefix);
    const [col, row] = [tileIndex % GRID_COLS, Math.floor(tileIndex / GRID_COLS)];
    for (let r_offset = -1; r_offset <= 1; r_offset++) {
        for (let c_offset = -1; c_offset <= 1; c_offset++) {
            if (r_offset === 0 && c_offset === 0) continue;
            const [nextCol, nextRow] = [col + c_offset, row + r_offset];
            const nextIndex = nextRow * GRID_COLS + nextCol;
            if (nextCol >= 0 && nextCol < GRID_COLS && nextRow >= 0 && nextRow < GRID_COLS && !path.includes(nextIndex)) {
                findWordsRecursive(nextIndex, prefix, [...path, nextIndex], foundWordsSet, board, trie);
            }
        }
    }
}

function solveBoard(board, trie) {
    const foundWordsSet = new Set();
    for (let i = 0; i < GRID_SIZE; i++) {
        findWordsRecursive(i, "", [i], foundWordsSet, board, trie);
    }
    return foundWordsSet;
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

function checkNoClumps(board) {
    for (let row = 0; row <= 2; row++) {
        for (let col = 0; col <= 2; col++) {
            const topLeft = row * GRID_COLS + col;
            const clumpLetters = [board[topLeft], board[topLeft + 1], board[topLeft + GRID_COLS], board[topLeft + GRID_COLS + 1]];
            if (clumpLetters.every(l => VOWELS.includes(l)) || clumpLetters.every(l => !VOWELS.includes(l))) {
                return false;
            }
        }
    }
    return true;
}


// How many days beyond today to keep pre-generated. A single failed run no
// longer takes Daily mode down — generation has to fail this many days in a
// row before players run out of puzzles.
const PUZZLE_DAYS_AHEAD = 3;

function nyDateString(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// One quality-checked board, or null if 10k attempts all failed the rules.
function generateQualityBoard() {
    for (let attempt = 0; attempt < 10000; attempt++) {
        const board = new Array(GRID_SIZE).fill(null).map(() => LETTER_BAG_STRING[Math.floor(Math.random() * LETTER_BAG_STRING.length)]);

        const vowelCount = board.filter(l => VOWELS.includes(l)).length;
        if (vowelCount < 5 || vowelCount > 7) continue;
        const hardConsonantCount = board.filter(l => HARD_CONSONANTS.includes(l)).length;
        if (hardConsonantCount > 1) continue;
        const qIndex = board.indexOf("Q");
        if (qIndex !== -1 && !getNeighbors(qIndex, board).some(l => l === "U")) continue;
        if (!checkNoClumps(board)) continue;

        const commonWords = solveBoard(board, commonDictionaryTrie);
        if (commonWords.size < 30) continue;

        const allWords = solveBoard(board, fullDictionaryTrie);
        if (allWords.size > 100) continue;

        logger.info(`Found a suitable board on attempt #${attempt + 1}`);
        return { board, allWords: Array.from(allWords) };
    }
    return null;
}

exports.generateDailyPuzzle = onSchedule({
    schedule: "every day 00:00",
    timeZone: "America/New_York",
    timeoutSeconds: 540,
    memory: "1GiB",
    // Cloud Scheduler re-runs a failed execution (see the throw below), so a
    // transient error doesn't cost a day of buffer.
    retryCount: 3
}, async (event) => {
    if (!fullDictionaryTrie) {
        logger.info("Initializing Tries...");
        // Required lazily so the other (tiny) scheduled functions in this
        // file don't parse 6MB of dictionary JSON on their cold starts.
        fullDictionaryTrie = new Trie(require("./scrabble-dictionary.json"));
        commonDictionaryTrie = new Trie(require("./common-dictionary.json"));
    }

    const db = getFirestore();
    const failures = [];

    for (let offset = 0; offset <= PUZZLE_DAYS_AHEAD; offset++) {
        const dateStr = nyDateString(offset);
        const puzzleRef = db.collection('dailyPuzzles').doc(dateStr);

        // Never overwrite an existing puzzle — once published, players may
        // already be mid-game on it (and cached copies must stay valid).
        if ((await puzzleRef.get()).exists) continue;

        const found = generateQualityBoard();
        if (!found) {
            logger.error(`Failed to generate a suitable puzzle for ${dateStr}.`);
            failures.push(dateStr);
            continue;
        }
        await puzzleRef.set({
            board: found.board,
            allWords: found.allWords,
            bonuses: [],
            createdAt: FieldValue.serverTimestamp()
        });
        logger.info(`Successfully saved puzzle for ${dateStr}.`);
    }

    if (failures.length > 0) {
        // Marks the run failed: Cloud Scheduler retries it (retryCount above)
        // and the error lands in Error Reporting, where an alerting policy
        // can email the owner.
        throw new Error(`Failed to generate puzzle(s) for: ${failures.join(', ')}`);
    }
});

    // ✅ NEW: This single function resets BOTH daily leaderboards at midnight.
exports.resetDailyLeaderboards = onSchedule({
    schedule: "every day 00:00",
    timeZone: "America/New_York"
}, async (event) => {
    logger.info("Resetting all daily leaderboards...");
    const db = getFirestore();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // 1. Reference to the TIMED daily leaderboard
    const timedLeaderboardRef = db.collection('leaderboards').doc('daily');

    // 2. Reference to the CHALLENGE daily leaderboard
    const challengeLeaderboardRef = db.collection('leaderboards').doc('dailyChallenge');

    try {
        // Reset the timed board to its 3-category structure
        await timedLeaderboardRef.set({
            date: todayStr,
            topByHighScore: [],
            topByTotalScore: [],
            topByBestWord: []
        });

        // Reset the challenge board to its simple structure
        await challengeLeaderboardRef.set({
            date: todayStr,
            topScores: []
        });

        logger.info("Both daily leaderboards have been reset successfully.");
    } catch (error) {
        logger.error("Error resetting daily leaderboards:", error);
    }

    // dailyScores/{date}/entries holds one doc per player (their best score
    // of that day), written client-side to compute rank/percentile on the
    // end-game screen. Each day is its own doc/subcollection, so yesterday's
    // is safe to delete wholesale once it's no longer "today" for anyone.
    try {
        await db.recursiveDelete(db.collection('dailyScores').doc(yesterdayStr));
        logger.info(`Cleaned up dailyScores/${yesterdayStr}.`);
    } catch (error) {
        logger.error("Error cleaning up yesterday's dailyScores:", error);
    }
});

// Challenge docs are created with a 7-day expiresAt and nothing ever deletes
// them afterward — the client already treats expired ones as invisible
// (game.js filters them out client-side), but they stay in Firestore forever,
// so every "My Challenges" load (an array-contains query, billed per document
// returned) keeps paying to re-fetch docs no player can even see. Delete them
// server-side once they're past that same expiresAt cutoff.
exports.cleanupExpiredChallenges = onSchedule({
    schedule: "every day 03:00",
    timeZone: "America/New_York"
}, async (event) => {
    const db = getFirestore();
    const now = Timestamp.now();
    let totalDeleted = 0;

    // Firestore batches cap at 500 writes; page through in chunks in case a
    // backlog ever exceeds that in one run.
    while (true) {
        const snap = await db.collection('challenges')
            .where('expiresAt', '<', now)
            .limit(400)
            .get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += snap.size;

        if (snap.size < 400) break;
    }

    logger.info(`Deleted ${totalDeleted} expired challenge(s).`);
});