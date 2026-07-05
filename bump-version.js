// Rewrites the ?v= cache-busting query strings on dist/style.css, style.css,
// and game.js in index.html to the current timestamp. CSS/JS are served with
// a one-year immutable Cache-Control header (firebase.json), so browsers that
// already cached an old file under the same URL will never re-fetch it —
// bumping the query string on every build forces a fresh URL per deploy.
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const version = Date.now().toString();

html = html
    .replace(/(href="\.\/dist\/style\.css\?v=)[^"]+(")/, `$1${version}$2`)
    .replace(/(href="style\.css\?v=)[^"]+(")/, `$1${version}$2`)
    .replace(/(src="game\.js\?v=)[^"]+(")/, `$1${version}$2`);

fs.writeFileSync(indexPath, html);
console.log(`Bumped cache-busting version to ${version}`);
