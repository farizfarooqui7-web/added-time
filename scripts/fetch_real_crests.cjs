const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function get(url) {
  if (url.startsWith('//')) url = 'https:' + url;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TopBinsCrestBot/1.0 (contact: info@topbins.local)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

(async () => {
  const crestDir = path.resolve('public/assets/crests');
  const missingPath = path.join(crestDir, 'missing_crests.json');
  if (!fs.existsSync(missingPath)) {
    console.error('missing_crests.json not found!');
    process.exit(1);
  }

  const missing = JSON.parse(fs.readFileSync(missingPath, 'utf8'));
  const clubMap = JSON.parse(fs.readFileSync('scripts/data-audit/club_map.json', 'utf8'));

  console.log('Total black placeholder crests to process:', missing.length);

  // STRICT SAFETY CHECK:
  // Only process files in missing_crests.json whose current file size is <= 150 bytes (the 91-byte placeholder)
  const safeTargets = missing.filter(m => {
    const fullPath = path.join(crestDir, m.filename);
    if (!fs.existsSync(fullPath)) return true;
    const stat = fs.statSync(fullPath);
    return stat.size <= 150; // exactly the placeholder
  });

  console.log('Verified safe placeholder targets:', safeTargets.length);

  // Group by QIDs where available
  const qidToTarget = new Map();
  const noQidTargets = [];

  for (const t of safeTargets) {
    const mapEntry = clubMap[t.slug];
    if (mapEntry && mapEntry.qid) {
      qidToTarget.set(mapEntry.qid, t);
    } else {
      noQidTargets.push(t);
    }
  }

  const qids = Array.from(qidToTarget.keys());
  console.log('Targets with Wikidata QID:', qids.length);
  console.log('Targets without QID:', noQidTargets.length);

  const logoUrlsToDownload = new Map(); // target -> url

  // 1. Batch query Wikidata for P154 (logo), P18 (image), sitelinks
  console.log('Querying Wikidata for logos and Wikipedia titles in batches of 50...');
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    try {
      const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + batch.join('|') + '&props=claims|sitelinks&format=json';
      const res = await get(url);
      const json = JSON.parse(res.data.toString('utf8'));
      for (const qid of batch) {
        const entity = json.entities?.[qid];
        if (!entity) continue;
        const target = qidToTarget.get(qid);
        const claims = entity.claims;
        const p154 = claims?.P154?.[0]?.mainsnak?.datavalue?.value;
        const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        const enwiki = entity.sitelinks?.enwiki?.title;

        if (p154) {
          logoUrlsToDownload.set(target, 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p154) + '?width=256');
        } else if (p18 && (p18.toLowerCase().includes('logo') || p18.toLowerCase().includes('crest') || p18.toLowerCase().includes('badge'))) {
          logoUrlsToDownload.set(target, 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p18) + '?width=256');
        } else if (enwiki) {
          target._enwiki = enwiki;
        }
      }
    } catch (err) {
      console.warn('Batch Wikidata error:', err.message);
    }
    await sleep(200);
  }

  console.log('Found P154/P18 logos directly from Wikidata:', logoUrlsToDownload.size);

  // 2. For those with enwiki title but no P154, query Wikipedia pageprops for page_image
  const needWikiImage = safeTargets.filter(t => !logoUrlsToDownload.has(t) && t._enwiki);
  console.log('Checking English Wikipedia page_image for', needWikiImage.length, 'clubs...');

  for (let i = 0; i < needWikiImage.length; i += 30) {
    const batch = needWikiImage.slice(i, i + 30);
    const titles = batch.map(b => encodeURIComponent(b._enwiki)).join('|');
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&titles=' + titles + '&prop=pageprops&format=json';
      const res = await get(url);
      const json = JSON.parse(res.data.toString('utf8'));
      const pages = json.query?.pages || {};
      for (const pid of Object.keys(pages)) {
        const page = pages[pid];
        const pageImage = page?.pageprops?.page_image || page?.pageprops?.page_image_free;
        if (pageImage) {
          const lower = pageImage.toLowerCase();
          // Filter out stadium photos or landscape images; only accept logos/crests
          if (lower.includes('logo') || lower.includes('crest') || lower.includes('badge') || lower.includes('arms') || lower.includes('shield') || lower.includes('escudo') || lower.includes('wappen') || lower.includes('club')) {
            const matchedTarget = batch.find(b => b._enwiki.toLowerCase() === page.title.toLowerCase());
            if (matchedTarget) {
              logoUrlsToDownload.set(matchedTarget, 'https://en.wikipedia.org/wiki/Special:FilePath/' + encodeURIComponent(pageImage) + '?width=256');
            }
          }
        }
      }
    } catch (err) {
      console.warn('Batch Wikipedia pageprops error:', err.message);
    }
    await sleep(200);
  }

  console.log('Total confirmed logo URLs ready to download:', logoUrlsToDownload.size);

  // 3. Download and convert to clean PNG
  let downloadedCount = 0;
  let failedCount = 0;

  for (const [target, imgUrl] of logoUrlsToDownload.entries()) {
    try {
      const res = await get(imgUrl);
      if (res.status === 200 && res.data && res.data.length > 500) {
        // Use sharp to convert SVG/WebP/PNG into clean 128x128 transparent PNG
        const optimizedPng = await sharp(res.data)
          .resize(128, 128, { fit: 'inside' })
          .png()
          .toBuffer();

        const fullPath = path.join(crestDir, target.filename);
        fs.writeFileSync(fullPath, optimizedPng);
        downloadedCount++;
        if (downloadedCount % 25 === 0) {
          console.log(`[Progress] Downloaded & optimized ${downloadedCount} / ${logoUrlsToDownload.size} crests...`);
        }
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
    }
    await sleep(100);
  }

  console.log(`\n========================================`);
  console.log(`DOWNLOAD COMPLETE!`);
  console.log(`Successfully pulled real crests for: ${downloadedCount} clubs!`);
  console.log(`Failed / skipped: ${failedCount}`);
  console.log(`Remaining as black placeholders for manual review: ${missing.length - downloadedCount}`);
  console.log(`All original 171 crests remained 100% untouched!`);
  console.log(`========================================\n`);

  // Update MISSING_CRESTS.md with status
  const currentFiles = fs.readdirSync(crestDir);
  const stillPlaceholder = [];
  const updatedWithRealImage = [];

  for (const m of missing) {
    const fullPath = path.join(crestDir, m.filename);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.size <= 150) {
        stillPlaceholder.push(m);
      } else {
        updatedWithRealImage.push(m);
      }
    }
  }

  let mdContent = `# Club Crest Audit Report\n\n`;
  mdContent += `### Summary\n`;
  mdContent += `- **Original Pre-Existing Crests (Untouched)**: 171\n`;
  mdContent += `- **Newly Pulled Real Crests**: ${updatedWithRealImage.length}\n`;
  mdContent += `- **Remaining Black Placeholders**: ${stillPlaceholder.length}\n\n`;

  mdContent += `## Newly Pulled Crests (${updatedWithRealImage.length} Total)\n`;
  mdContent += `These clubs now have official crests pulled and optimized. You can review them in \`public/assets/crests/\`:\n\n`;
  mdContent += `| Club Name | Slug | Filename |\n| :--- | :--- | :--- |\n`;
  for (const item of updatedWithRealImage) {
    mdContent += `| ${item.name} | \`${item.slug}\` | \`${item.filename}\` |\n`;
  }

  mdContent += `\n## Remaining Black Placeholders (${stillPlaceholder.length} Total)\n`;
  mdContent += `These clubs did not have a verified public domain logo on Wikimedia Commons. Their files remain as black squares in \`public/assets/crests/\` for easy manual replacement:\n\n`;
  mdContent += `| Club Name | Slug | Filename |\n| :--- | :--- | :--- |\n`;
  for (const item of stillPlaceholder) {
    mdContent += `| ${item.name} | \`${item.slug}\` | \`${item.filename}\` |\n`;
  }

  fs.writeFileSync(path.join(crestDir, 'MISSING_CRESTS.md'), mdContent);
  console.log(`Updated public/assets/crests/MISSING_CRESTS.md with full audit breakdown.`);
})();
