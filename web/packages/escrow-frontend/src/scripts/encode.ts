import fs from 'fs/promises';
import mime from 'mime';

async function main() {
    const args = process.argv.slice(2);
    const imgPath = args[0];
    const mimeType = mime.getType(imgPath);

    const buf = await fs.readFile(imgPath);
    const base64 = buf.toString('base64');
    console.log(`data:${mimeType};base64,${base64}`);
}

main();