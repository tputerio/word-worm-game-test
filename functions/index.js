const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

const fullDictionaryTrieData = require("./scrabble-dictionary.json");
const commonDictionaryTrieData = require("./common-dictionary.json");

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


exports.generateDailyPuzzle = onSchedule({
    schedule: "every day 00:00",
    timeZone: "America/New_York",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (event) => {
    // ✅ FIX: This function now only generates a puzzle for the CURRENT day.
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    logger.info(`Generating new puzzle for ${todayStr}...`);
    
    if (!fullDictionaryTrie) {
        logger.info("Initializing Tries...");
        const fullDictionaryTrieData = require("./scrabble-dictionary.json");
        const commonDictionaryTrieData = require("./common-dictionary.json");
        fullDictionaryTrie = new Trie(fullDictionaryTrieData);
        commonDictionaryTrie = new Trie(commonDictionaryTrieData);
    }

    const db = getFirestore();
    let foundBoard = null;

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

        foundBoard = { board, allWords: Array.from(allWords) };
        logger.info(`Found a suitable board on attempt #${attempt + 1}`);
        break;
    }

    if (foundBoard) {
        const puzzleRef = db.collection('dailyPuzzles').doc(todayStr);
        const puzzleData = {
            board: foundBoard.board,
            allWords: foundBoard.allWords,
            bonuses: [],
            createdAt: FieldValue.serverTimestamp()
        };
        // ✅ FIX: This will now CREATE or OVERWRITE the document for today.
        await puzzleRef.set(puzzleData);
        logger.info(`Successfully saved puzzle for ${todayStr}.`);
    } else {
        logger.error(`Failed to generate a suitable puzzle for ${todayStr}.`);
    }
});