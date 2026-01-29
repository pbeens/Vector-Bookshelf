import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const epub2 = require('epub2');

console.log('epub2 export keys:', Object.keys(epub2));
console.log('epub2 export type:', typeof epub2);
if (epub2.EPub) console.log('epub2.EPub keys:', Object.keys(epub2.EPub));
