// This script fetches the 20k common word list and reads your local
// Scrabble dictionary. It then filters the common words and overwrites
// the 'common-dictionary.json' file with the cleaned-up version.

const fs = require('fs');
const https = require('https');

// --- Trie Class ---
class Trie {
    constructor() {
        this.root = {};
    }
    insert(word) {
        let node = this.root;
        for (const char of word) {
            if (!node[char]) node[char] = {};
            node = node[char];
        }
        node.isEndOfWord = true;
    }
}

// --- CONFIGURATION ---
const COMMON_WORDS_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
// Uses your local Scrabble dictionary file as the source of truth.
const SCRABBLE_DICT_PATH = './assets/dictionary.txt';
// Overwrites your existing common dictionary file.
const OUTPUT_PATH = './assets/common-dictionary.json';

// Helper function to fetch a file from a URL
function fetchFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => resolve(rawData));
        }).on('error', (e) => reject(e));
    });
}

async function buildCleanedDictionary() {
    console.log('Starting dictionary build process...');

    try {
        // 1. Fetch the remote common words and read the local Scrabble dictionary
        console.log(`Downloading common words from ${COMMON_WORDS_URL}...`);
        const commonWordsData = await fetchFile(COMMON_WORDS_URL);
        console.log('Download complete.');

        console.log(`Reading Scrabble dictionary from ${SCRABBLE_DICT_PATH}...`);
        const scrabbleWordsData = fs.readFileSync(SCRABBLE_DICT_PATH, 'utf8');
        console.log('Local dictionary read complete.');


        // 2. Create a Set of Scrabble words for fast lookups
        const scrabbleWordSet = new Set(
            scrabbleWordsData.split('\n').map(w => w.trim().toUpperCase())
        );

        // 3. Filter the common words list
        console.log('Cleaning the common words list...');
        const cleanedWords = commonWordsData.split('\n')
            .map(w => w.trim().toUpperCase())
            .filter(word =>
                word.length >= 3 &&
                scrabbleWordSet.has(word)
            );

        // 4. Build the final Trie from the cleaned list
        const dictionaryTrie = new Trie();
        for (const word of cleanedWords) {
            dictionaryTrie.insert(word);
        }
        console.log(`Trie built with ${cleanedWords.length} cleaned common words.`);

        // 5. Save the new Trie, overwriting the old file
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dictionaryTrie.root));
        console.log(`✅ Success! ${OUTPUT_PATH} has been overwritten with the cleaned version.`);

    } catch (e) {
        console.error('Error during build process:', e.message);
    }
}

buildCleanedDictionary();