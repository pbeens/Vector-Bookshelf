
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
    const pkg = require('pdf-parse');
    console.log('Type of pkg:', typeof pkg);
    if (typeof pkg === 'function') {
        console.log('Pkg is a function');
    }
    console.log('Keys:', Object.keys(pkg).sort());
} catch (e) {
    console.error(e);
}
