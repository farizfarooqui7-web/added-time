const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createBlackPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(len + 12);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crcVal = crc32(Buffer.concat([Buffer.from(type), data]));
    buf.writeUInt32BE(crcVal, len + 8);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const scanlineLength = 1 + width * 3;
  const rawData = Buffer.alloc(scanlineLength * height, 0);
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const crestDir = path.resolve('public/assets/crests');
if (!fs.existsSync(crestDir)) fs.mkdirSync(crestDir, { recursive: true });

const existing = new Set(fs.readdirSync(crestDir).map(f => f.toLowerCase()));
const dbPath = path.resolve('src/data/linkUpDatabase.json');
const linkUp = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const special = {
  'ac-milan': 'ac_milan.svg',
  'arsenal': 'arsenal.svg',
  'atletico-madrid': 'atletico_madrid.png',
  'bayern-munich': 'bayern_munich.svg',
  'blackburn-rovers': 'blackburn.png',
  'bolton-wanderers': 'bolton.png',
  'borussia-dortmund': 'borussia_dortmund.png',
  'chelsea': 'chelsea.svg',
  'deportivo-la-coruna': 'deportivo.png',
  'everton': 'everton.png',
  'fc-barcelona': 'fc_barcelona.svg',
  'fiorentina': 'fiorentina.png',
  'inter-milan': 'inter_milan.png',
  'juventus': 'juventus.png',
  'lazio': 'lazio.png',
  'leicester-city': 'leicester.png',
  'bayer-leverkusen': 'leverkusen.png',
  'liverpool': 'liverpool.svg',
  'malaga': 'malaga.png',
  'manchester-city': 'manchester_city.svg',
  'manchester-united': 'manchester_united.svg',
  'borussia-monchengladbach': 'monchengladbach.png',
  'napoli': 'napoli.png',
  'newcastle-united': 'newcastle.png',
  'queens-park-rangers': 'qpr.png',
  'real-betis': 'real_betis.png',
  'real-madrid': 'real_madrid.svg',
  'as-roma': 'roma.png',
  'sevilla': 'sevilla.png',
  'stoke-city': 'stoke.png',
  'swansea-city': 'swansea.png',
  'tottenham-hotspur': 'tottenham.png',
  'valencia': 'valencia.png',
  'villarreal': 'villarreal.png',
  'werder-bremen': 'werder_bremen.png',
  'vfl-wolfsburg': 'wolfsburg.png',
};

const needed = new Map();
for (const p of linkUp) {
  if (p.clubs) {
    for (const c of p.clubs) {
      if (c && c.slug) {
        const file = special[c.slug] || (c.slug + '.png');
        if (!needed.has(file.toLowerCase())) {
          needed.set(file.toLowerCase(), { filename: file, slug: c.slug, name: c.name || c.slug });
        }
      }
    }
  }
}

const blackPng = createBlackPng(128, 128);
const missingList = [];
let createdCount = 0;

for (const [key, obj] of needed.entries()) {
  if (!existing.has(key)) {
    missingList.push(obj);
    const targetPath = path.join(crestDir, obj.filename);
    fs.writeFileSync(targetPath, blackPng);
    createdCount++;
  }
}

missingList.sort((a, b) => a.name.localeCompare(b.name));

// Save JSON list
fs.writeFileSync(
  path.join(crestDir, 'missing_crests.json'),
  JSON.stringify(missingList, null, 2)
);

// Save Markdown table list for easy reading
let mdContent = '# Missing Club Crests (' + missingList.length + ' Total)\n\n';
mdContent += 'All missing files have been created as **solid black 128x128 PNGs** in `public/assets/crests/`.\n';
mdContent += 'You can easily spot them and drop your real crest PNGs in to replace them anytime!\n\n';
mdContent += '| Club Name | Slug | Expected Filename in `public/assets/crests/` |\n';
mdContent += '| :--- | :--- | :--- |\n';
for (const item of missingList) {
  mdContent += '| ' + item.name + ' | `' + item.slug + '` | `' + item.filename + '` |\n';
}

fs.writeFileSync(path.join(crestDir, 'MISSING_CRESTS.md'), mdContent);

console.log('CREATED ' + createdCount + ' BLACK PLACEHOLDER CRESTS!');
console.log('List saved to:');
console.log('1. public/assets/crests/MISSING_CRESTS.md');
console.log('2. public/assets/crests/missing_crests.json');
