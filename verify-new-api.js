
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const pkg = require('pdf-parse');
        console.log('Package Keys:', Object.keys(pkg));
        
        const { PDFParse } = pkg;
        console.log('PDFParse class:', PDFParse);
        
        if (PDFParse) {
             // Try to instantiate
             const files = fs.readdirSync('.').filter(f => f.endsWith('.pdf'));
             if (files.length > 0) {
                 const file = files[0];
                 const buffer = fs.readFileSync(file);
                 
                 // Based on d.ts: constructor(options: LoadParameters)
                 // LoadParameters { data: ... }
                 const parser = new PDFParse({ data: buffer });
                 console.log('Instance created');
                 
                 const info = await parser.getInfo();
                 console.log('Info Result:', JSON.stringify(info, null, 2));
             } else {
                 console.log("No PDF found to test, but class import worked.");
             }
        }
    } catch (e) {
        console.error(e);
    }
}
test();
