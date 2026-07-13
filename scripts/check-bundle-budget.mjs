import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const limit = 70 * 1024;
const assetsDirectory = path.resolve('frontend/dist/assets');
const entryFile = (await fs.readdir(assetsDirectory)).find((fileName) =>
  /^index-[\w-]+\.js$/.test(fileName),
);

if (!entryFile) {
  throw new Error('Frontend entry chunk was not found.');
}

const compressedBytes = gzipSync(
  await fs.readFile(path.join(assetsDirectory, entryFile)),
).byteLength;
if (compressedBytes > limit) {
  throw new Error(
    `Initial JavaScript chunk is ${compressedBytes} bytes gzip; budget is ${limit} bytes.`,
  );
}

console.log(`Initial JavaScript chunk: ${compressedBytes} bytes gzip (budget ${limit}).`);
