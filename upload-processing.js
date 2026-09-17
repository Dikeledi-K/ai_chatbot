import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT = 50000;

const supportedTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp']
]);

export function getFileExtension(filename = '') {
  return path.extname(filename).toLowerCase();
}

export function validateUploadedFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return { valid: false, message: 'Please choose a file to upload.' };
  }

  if (!file.size) {
    return { valid: false, message: 'This file is empty. Please choose a file with content.' };
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return { valid: false, message: 'This file is too large. Please choose a file under 10 MB.' };
  }

  const extension = getFileExtension(file.originalname);
  const expectedType = supportedTypes.get(extension);
  const acceptsBinaryTextFallback = extension === '.txt' && file.mimetype === 'application/octet-stream';
  const acceptsImageMime = extension && ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) && file.mimetype && file.mimetype.startsWith('image/');
  if (!expectedType || (file.mimetype && file.mimetype !== expectedType && !acceptsBinaryTextFallback && !acceptsImageMime)) {
    return { valid: false, message: 'That file type is not supported. Choose a PDF, DOCX, TXT, or image file.' };
  }

  return { valid: true, extension, mimeType: expectedType };
}

function hasZipSignature(buffer) {
  return buffer.subarray(0, 2).toString('hex') === '504b';
}

function hasPdfSignature(buffer) {
  return buffer.subarray(0, 5).toString() === '%PDF-';
}

function limitText(text) {
  return String(text || '').replace(/\u0000/g, '').trim().slice(0, MAX_EXTRACTED_TEXT);
}

export async function extractUploadedText(file, extension) {
  if (extension === '.txt') {
    return limitText(file.buffer.toString('utf8'));
  }

  if (extension === '.docx') {
    if (!hasZipSignature(file.buffer)) {
      throw new Error('This DOCX file does not appear to be valid.');
    }

    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return limitText(result.value);
  }

  if (extension === '.pdf') {
    if (!hasPdfSignature(file.buffer)) {
      throw new Error('This PDF does not appear to be a valid PDF file.');
    }

    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return limitText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    const result = await Tesseract.recognize(file.buffer, 'eng', { logger: () => {} });
    return limitText(result.data.text);
  }

  throw new Error('That file type is not supported. Please upload a PDF, DOCX, TXT, or image file.');
}

export function getUploadMetadata(file, extension, text) {
  return {
    name: path.basename(file.originalname).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'),
    extension,
    mimeType: supportedTypes.get(extension),
    size: file.size,
    textLength: text.length,
    truncated: text.length >= MAX_EXTRACTED_TEXT
  };
}

