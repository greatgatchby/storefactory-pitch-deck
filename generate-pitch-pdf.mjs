import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { readdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const slideDir = resolve(__dirname, './pitch-deck');
const outPath = resolve(__dirname, './pitch-deck/pitch-deck.pdf');

// Discovered from disk rather than hard-coded, so adding or removing a slide
// does not silently truncate the PDF at whatever the constant used to say.
const SLIDE_COUNT = readdirSync(slideDir)
  .map((f) => /^slide-(\d+)\.html$/.exec(f))
  .filter(Boolean)
  .map((m) => Number(m[1]))
  .reduce((max, n) => Math.max(max, n), 0);

const WIDTH = 1280;
const HEIGHT = 720;

const LOCAL_CHROME =
  '/Users/jakengatchu/.cache/puppeteer/chrome/mac_arm-146.0.7680.76/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

// In CI, PUPPETEER_EXECUTABLE_PATH is set automatically; locally fall back to the cached path.
const executablePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

console.log('Launching browser...');
const browser = await puppeteer.launch({
  headless: 'new',
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const pagePdfs = [];

for (let i = 1; i <= SLIDE_COUNT; i++) {
  const filePath = `file://${slideDir}/slide-${i}.html`;
  console.log(`  Rendering slide ${i}/${SLIDE_COUNT}...`);

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  await page.goto(filePath, { waitUntil: 'networkidle0', timeout: 30000 });

  // Give charts/fonts a moment to render
  await new Promise(r => setTimeout(r, 600));

  const pdfBytes = await page.pdf({
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  pagePdfs.push(pdfBytes);
  await page.close();
}

await browser.close();

console.log('Merging pages into single PDF...');
const merged = await PDFDocument.create();

for (const pdfBytes of pagePdfs) {
  const src = await PDFDocument.load(pdfBytes);
  const [copiedPage] = await merged.copyPages(src, [0]);
  merged.addPage(copiedPage);
}

const finalBytes = await merged.save();
writeFileSync(outPath, finalBytes);

console.log(`\nDone! PDF saved to:\n  ${outPath}`);
console.log(`  Pages: ${SLIDE_COUNT}  |  Size: ${(finalBytes.length / 1024).toFixed(0)} KB`);
