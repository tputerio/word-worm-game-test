// This is a utility script to be run once with Node.js
// It is NOT part of the main game code.
// Its purpose is to fetch the raw dictionary, build the Trie,
// and save it as an optimized JSON file.

// To run this:
// 1. Make sure you have Node.js installed.
// 2. Save this file as `build_dictionary.js`.
// 3. From your terminal, run `node build_dictionary.js`.
// 4. A new file named `dictionary.json` will be created in the same directory.
// 5. Upload that `dictionary.json` file to your GitHub repository.

const fs = require('fs');
const https = require('https');

// --- Trie Class (copied from the game) ---
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

const DICTIONARY_URL = 'https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt';
const OUTPUT_PATH = './dictionary.json';

async function buildAndSaveDictionary() {
    console.log(`Downloading dictionary from ${DICTIONARY_URL}...`);
    
    https.get(DICTIONARY_URL, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                console.log('Download complete. Building Trie...');
                const words = rawData.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length >= 3);
                
                // Add custom words
                words.push("ZEN", "KIN");

                const dictionaryTrie = new Trie();
                for (const word of words) {
                    dictionaryTrie.insert(word);
                }
                
                console.log(`Trie built with ${words.length} words. Saving to ${OUTPUT_PATH}...`);
                
                fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dictionaryTrie.root));
                
                console.log(`✅ Success! ${OUTPUT_PATH} has been created.`);

            } catch (e) {
                console.error('Error processing dictionary:', e.message);
            }
        });
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
    });
}

buildAndSaveDictionary();
