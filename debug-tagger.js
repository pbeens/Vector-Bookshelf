
import { processBookContent } from './src/server/tagger.js';
import path from 'path';
import fs from 'fs';

const testFile = "D:\\My Documents\\Downloads\\_qBit\\_Books to Read\\_Adobe\\Designing in Figma by Eugene Fedorenko.pdf";

async function debug() {
    console.log("--- Tagger Debug Start ---");
    console.log(`Checking if file exists: ${testFile}`);
    
    if (!fs.existsSync(testFile)) {
        console.error("ERROR: File not found at the specified path!");
        return;
    }

    console.log("Running processBookContent...");
    try {
        const result = await processBookContent(testFile);
        
        console.log("\n--- PROCESSING RESULT ---");
        if (result) {
            console.log("Tags:", result.tags);
            console.log("Summary:", result.summary);
        } else {
            console.log("RESULT WAS NULL (Extraction or AI failed)");
        }
    } catch (err) {
        console.error("CRITICAL ERROR during debug:", err);
    }
    console.log("\n--- Tagger Debug End ---");
}

debug();
