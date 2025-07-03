const fs = require('fs');
const path = require('path');
const https = require('https'); // To fetch files from the web

// --- Configuration ---
const commonWordsUrl = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
const scrabbleWordsUrl = 'https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt';
const outputDir = path.join(__dirname, 'assets');
const outputFilePath = path.join(outputDir, 'dictionary-clean.txt');

// --- Helper function to fetch a file from a URL ---
function fetchFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
}

// --- Main script logic ---
async function run() {
  console.log('Fetching word lists...');
  const [commonWordsText, scrabbleWordsText] = await Promise.all([
    fetchFile(commonWordsUrl),
    fetchFile(scrabbleWordsUrl)
  ]);
  console.log('Files fetched successfully.');

  // Create a Set of official Scrabble words for fast validation
  const scrabbleWordsSet = new Set(scrabbleWordsText.split('\n').map(w => w.trim().toLowerCase()));
  console.log(`Loaded ${scrabbleWordsSet.size} Scrabble words as the master list.`);

  console.log('Filtering common words against the Scrabble list...');
  const commonWordsArray = commonWordsText.split('\n').map(w => w.trim().toLowerCase());

  // Filter the common words list
  const cleanedWords = commonWordsArray.filter(word => {
    const isScrabbleWord = scrabbleWordsSet.has(word);
    const isLongEnough = word.length >= 3;
    const isShortEnough = word.length <= 12;
    const hasNoSpecialChars = /^[a-z]+$/.test(word);
    
    return isScrabbleWord && isLongEnough && isShortEnough && hasNoSpecialChars;
  });
  
  // Remove duplicates and add your custom words
  let finalWords = [...new Set(cleanedWords)];
  const customWordsToAdd = ['qat', 'kin', 'zen'];
  
  customWordsToAdd.forEach(customWord => {
    if (!finalWords.includes(customWord)) {
      finalWords.push(customWord);
    }
  });
  
  // Sort the final list alphabetically
  finalWords.sort();

  console.log(`Final word count: ${finalWords.length}`);
  
  // Create the 'assets' directory if it doesn't exist
  if (!fs.existsSync(outputDir)){
      fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the final, clean list to the output file
  fs.writeFileSync(outputFilePath, finalWords.join('\n'));
  
  console.log(`✅ Success! Clean dictionary saved to: ${outputFilePath}`);
}

// Run the main async function
run().catch(err => console.error(err));