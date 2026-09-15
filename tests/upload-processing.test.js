import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUploadedText, validateUploadedFile } from '../upload-processing.js';

test('reads UTF-8 text uploads without writing files', async () => {
  const file = { originalname: 'notes.txt', mimetype: 'text/plain', size: 18, buffer: Buffer.from('Photosynthesis notes') };
  const check = validateUploadedFile(file);
  assert.equal(check.valid, true);
  assert.equal(await extractUploadedText(file, check.extension), 'Photosynthesis notes');
});

test('rejects unsupported extensions and oversized files', () => {
  assert.equal(validateUploadedFile({ originalname: 'program.exe', mimetype: 'application/octet-stream', size: 10, buffer: Buffer.from('x') }).valid, false);
  assert.equal(validateUploadedFile({ originalname: 'large.txt', mimetype: 'text/plain', size: 10 * 1024 * 1024 + 1, buffer: Buffer.from('x') }).valid, false);
});

test('rejects malformed PDF data safely', async () => {
  const file = { originalname: 'broken.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('bad') };
  const check = validateUploadedFile(file);
  assert.equal(check.valid, true);
  await assert.rejects(() => extractUploadedText(file, check.extension));
});

test('rejects image uploads', () => {
  const file = { originalname: 'diagram.png', mimetype: 'image/png', size: 12, buffer: Buffer.from('image bytes') };
  assert.equal(validateUploadedFile(file).valid, false);
});