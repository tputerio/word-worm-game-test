const fs = require('fs');
const path = require('path');

// Define the input and output file paths
const inputFilePath = path.join(__dirname, 'assets', 'dictionary.txt');
const outputFilePath = path.join(__dirname, 'assets', 'dictionary-clean.txt');

console.log('Reading original dictionary...');

// Read the original file
const dictionaryText = fs.readFileSync(inputFilePath, 'utf-8');
const originalWords = dictionaryText.split('\n');

console.log(`Original word count: ${originalWords.length}`);
console.log('Cleaning words...');

// Clean the words based on our rules
const cleanedWords = originalWords
  .map(word => word.trim().toLowerCase()) // Trim whitespace and make all words lowercase
  .filter(word => {
    // Keep the word ONLY if it meets all these conditions:
    const isLongEnough = word.length >= 3;
    const isShortEnough = word.length <= 12; // Rule updated to 12 letters
    const hasNoSpecialChars = /^[a-z]+$/.test(word);

    return isLongEnough && isShortEnough && hasNoSpecialChars;
  });

// Remove duplicates
let uniqueCleanedWords = [...new Set(cleanedWords)];

// Manually add specific words if they don't already exist
const customWordsToAdd = ['zen', 'kin'];
customWordsToAdd.forEach(customWord => {
  if (!uniqueCleanedWords.includes(customWord)) {
    uniqueCleanedWords.push(customWord);
    console.log(`Added missing word: ${customWord}`);
  }
});

// Sort the final list alphabetically
uniqueCleanedWords.sort();

console.log(`New word count: ${uniqueCleanedWords.length}`);
console.log('Saving new clean dictionary...');

// Write the new, clean list to the output file
fs.writeFileSync(outputFilePath, uniqueCleanedWords.join('\n'));

console.log(`✅ Success! Clean dictionary saved to: ${outputFilePath}`);
