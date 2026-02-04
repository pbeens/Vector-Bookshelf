import fs from 'fs';
import path from 'path';

const TAXONOMY_FILE = path.resolve('taxonomy.json');
const OUTPUT_FILE = path.resolve('TMP_TAGS_AND_CATEGORIES.md');

try {
    const data = fs.readFileSync(TAXONOMY_FILE, 'utf8');
    const mapping = JSON.parse(data);
    
    let md = '# Taxonomy Dump\n\n| Sub-Tag | Master Category |\n| :--- | :--- |\n';
    
    // Sort by key
    const sortedKeys = Object.keys(mapping).sort();
    
    for (const key of sortedKeys) {
        md += `| ${key} | ${mapping[key]} |\n`;
    }
    
    fs.writeFileSync(OUTPUT_FILE, md);
    console.log(`Dumped ${sortedKeys.length} entries to ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Error:', e.message);
}
