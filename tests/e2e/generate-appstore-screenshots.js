// Generates iPhone App Store screenshots by driving the deployed test site
// with Playwright. Word Worm's native-app styling ("capacitor-native" CSS
// class) is applied unconditionally in game.js regardless of host, so the
// website renders pixel-identical to the iOS Capacitor shell once
// window.Capacitor is stubbed present — no simulator/Xcode build needed.
//
// Output is the canonical 6.9" iPhone size (1320x2868 @3x from a 440x956
// viewport) — App Store Connect auto-scales this down for every smaller
// iPhone, so a single set is sufficient (no iPad).
//
// Usage: node tests/e2e/generate-appstore-screenshots.js [outDir]

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'https://wordworm-test-c7f3a.web.app';
if (/wordwormgame\.com|word-rush-game-9010a/i.test(BASE_URL)) {
    console.error('Refusing to run against production (' + BASE_URL + ') — this drives real gameplay (writes scores/usernames). Point BASE_URL at the test site.');
    process.exit(1);
}

const OUT_DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'appstore-screenshots'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 440, height: 956 }; // iPhone 16/17 Pro Max points
const SAFE_AREA = { top: 59, bottom: 34, left: 0, right: 0 }; // Dynamic Island + home indicator

async function applySafeArea(context, page) {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: SAFE_AREA });
}

// Finds a real, on-board, adjacency-connected word (4-6 letters) using the
// site's own common-word dictionary + the currently rendered board, so the
// screenshot shows a genuine playable swipe rather than a fake selection.
async function findWordPath(page, exclude) {
    return await page.evaluate(async (exclude) => {
        const res = await fetch('assets/common-dictionary.json');
        const trieRoot = await res.json();
        const search = (word, isPrefix) => {
            let node = trieRoot;
            for (const ch of word) {
                if (!node[ch]) return false;
                node = node[ch];
            }
            return isPrefix ? true : node.isEndOfWord === true;
        };
        const tiles = Array.from(document.querySelectorAll('.tile'));
        const board = new Array(tiles.length);
        tiles.forEach(t => { board[parseInt(t.dataset.id, 10)] = t.dataset.letter; });
        const cols = 4;
        const neighborsOf = i => {
            const r = Math.floor(i / cols), c = i % cols, out = [];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < cols && nc >= 0 && nc < cols) out.push(nr * cols + nc);
            }
            return out;
        };
        let best = null;
        const visit = (path, word) => {
            if (word.length >= 4 && search(word, false) && !exclude.includes(word)) {
                if (!best || word.length > best.word.length) best = { path: path.slice(), word };
            }
            if (best && best.word.length >= 5) return;
            if (word.length >= 6) return;
            for (const n of neighborsOf(path[path.length - 1])) {
                if (path.includes(n)) continue;
                const nextWord = word + board[n];
                if (!search(nextWord, true)) continue;
                path.push(n);
                visit(path, nextWord);
                path.pop();
                if (best && best.word.length >= 5) return;
            }
        };
        for (let i = 0; i < board.length; i++) {
            visit([i], board[i]);
            if (best && best.word.length >= 5) break;
        }
        return best;
    }, exclude);
}

async function tileCenter(page, index) {
    const box = await page.locator(`.tile[data-id="${index}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Swipes the given tile path with real mouse events (the game listens for
// pointerdown/move/up), optionally taking a screenshot mid-drag before
// releasing (to capture the "current word" preview + connecting line).
async function swipeWord(page, path_, { midDragShot } = {}) {
    const points = [];
    for (const i of path_) points.push(await tileCenter(page, i));
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let i = 1; i < points.length; i++) {
        await page.mouse.move(points[i].x, points[i].y, { steps: 8 });
    }
    await page.waitForTimeout(150);
    if (midDragShot) await page.screenshot({ path: midDragShot });
    await page.mouse.up();
    await page.waitForTimeout(900); // let the score/confetti animation settle
}

(async () => {
    console.log(`Site: ${BASE_URL}\nOutput: ${OUT_DIR}`);
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
    await context.addInitScript(() => {
        // Makes game.js believe it's running inside the Capacitor iOS shell,
        // which is what actually switches on the app-style safe-area padding
        // (viewport-fit=cover) — everything else in that layout is unconditional.
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    });
    const page = await context.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });
    await applySafeArea(context, page);

    await page.goto(BASE_URL, { waitUntil: 'load' });
    await applySafeArea(context, page);
    await page.waitForSelector('#mode-timed-btn', { timeout: 20000 });
    await page.waitForTimeout(6000); // anonymous auth + dictionary load

    await page.screenshot({ path: path.join(OUT_DIR, '01-home.png') });
    console.log('Saved 01-home.png');

    // --- Quick Play (standard timed mode) ---
    await page.click('#mode-timed-btn');
    await page.waitForSelector('.tile[data-id="15"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    const found = [];
    const word1 = await findWordPath(page, found);
    if (word1) {
        found.push(word1.word);
        await swipeWord(page, word1.path, { midDragShot: path.join(OUT_DIR, '02-gameplay-swipe.png') });
        console.log('Saved 02-gameplay-swipe.png (word: ' + word1.word + ')');
    }
    for (let i = 0; i < 2; i++) {
        const w = await findWordPath(page, found);
        if (!w) break;
        found.push(w.word);
        await swipeWord(page, w.path);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '03-gameplay-score.png') });
    console.log('Saved 03-gameplay-score.png (words so far: ' + found.join(', ') + ')');

    console.log('Waiting out the 60s timer for the end-game screen...');
    await page.waitForTimeout(60000);
    await page.waitForSelector('#end-game-modal-content, #endgame-name-input', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '04-endgame.png') });
    console.log('Saved 04-endgame.png');

    // --- Daily Puzzle (fresh load) ---
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await applySafeArea(context, page);
    await page.waitForSelector('#mode-daily-btn', { timeout: 20000 });
    await page.waitForTimeout(4000);
    await page.click('#mode-daily-btn');
    await page.waitForSelector('.tile[data-id="15"]', { timeout: 20000 });
    await page.waitForTimeout(800);

    const dailyWord = await findWordPath(page, []);
    if (dailyWord) await swipeWord(page, dailyWord.path);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, '05-daily-puzzle.png') });
    console.log('Saved 05-daily-puzzle.png' + (dailyWord ? ' (word: ' + dailyWord.word + ')' : ''));

    await browser.close();
    console.log('Done.');
})().catch(e => { console.error('Screenshot generation error:', e); process.exit(1); });
