const fs = require('fs');
const path = require('path');
const https = require('https'); // Use the built-in 'https' module to fetch the file

// --- File Paths ---
const inputFilePath = path.join(__dirname, 'dictionary.txt');      // Your 20k common word list
const outputFilePath = path.join(__dirname, 'assets', 'dictionary-clean.txt'); // The final output
const scrabbleWordsUrl = 'https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt';

// This is an async function to handle the web request
async function run() {
  console.log('Fetching Scrabble master list from GitHub...');

  // Fetch the remote Scrabble dictionary
  const scrabbleWordsText = await new Promise((resolve, reject) => {
    https.get(scrabbleWordsUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });

  // Create a Set of official Scrabble words for very fast lookups
  // The .toLowerCase() handles the capitalization in the source file
  const scrabbleWordsSet = new Set(scrabbleWordsText.split('\n').map(w => w.trim().toLowerCase()));

  console.log(`Loaded ${scrabbleWordsSet.size} official Scrabble words.`);
  console.log('Reading your local dictionary...');

  // Read your local 20k dictionary
  const dictionaryText = fs.readFileSync(inputFilePath, 'utf-8');

  console.log('Validating your dictionary...');

  // --- Filtering Logic ---
  const cleanedWords = dictionaryText
    .split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => {
      // A word is kept ONLY if it meets ALL of these conditions:
      const isScrabbleWord = scrabbleWordsSet.has(word);
      const isLongEnough = word.length >= 3;
      const isShortEnough = word.length <= 12;
      const hasNoSpecialChars = /^[a-z]+$/.test(word);

      return isScrabbleWord && isLongEnough && isShortEnough && hasNoSpecialChars;
    });

  let uniqueCleanedWords = [...new Set(cleanedWords)];


  uniqueCleanedWords.sort();

  console.log(`New word count: ${uniqueCleanedWords.length}`);
  console.log('Saving new clean dictionary...');

  fs.writeFileSync(outputFilePath, uniqueCleanedWords.join('\n'));
  console.log(`✅ Success! Final dictionary saved to: ${outputFilePath}`);
}

// Run the main async function
run().catch(err => console.error(err));