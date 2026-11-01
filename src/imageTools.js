// Client-side preparation for chat attachments: pictures and a short list of document types.
//
// PICTURES: every picked image is decoded and RE-ENCODED to JPEG on a canvas. That shrinks it to fit in
// Firestore, applies the camera's EXIF rotation, and throws away everything that is not pixels
// (EXIF/GPS data, embedded scripts in SVG, animation, odd formats). The result is two data URLs:
//   thumb  small preview that is stored inside the message document
//   full   the viewable image, stored in a separate digitalEntertainment_chats/{uid}/images/{id} document
//          and only downloaded when somebody opens it.
//
// FILES: only the types in FILE_TYPES (PDF, Word .docx, Excel .xlsx, CSV, plain text), up to MAX_FILE_BYTES.
// The type comes from the file extension, never from what the browser reports, and the first bytes of the
// file must match it, so an .exe renamed to .pdf is refused. Files are stored as-is in
// digitalEntertainment_chats/{uid}/files/{id} and are only ever downloaded, never rendered in the page.
// Legacy .doc/.xls (which can carry macros) and archives are deliberately not on the list.

import { useState, useRef, useCallback } from "react";

export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // refuse to even decode anything bigger
export const MAX_FULL_CHARS = 600000; // data-URL length cap for the full image (rules allow 700000)
export const MAX_THUMB_CHARS = 25000; // data-URL length cap for the thumbnail (rules allow 60000); small, because up to 200 are downloaded per conversation
export const JPEG_PREFIX = "data:image/jpeg;base64,";

export const MAX_FILE_BYTES = 500 * 1024; // base64 of 500 KB is ~683,000 characters; rules allow 700000
export const MAX_FILE_NAME = 80;

// (longest side in px, JPEG quality) - tried in order until the result fits MAX_FULL_CHARS
const FULL_STEPS = [[1600, 0.82], [1400, 0.76], [1200, 0.7], [1024, 0.65], [800, 0.6], [640, 0.55]];
const THUMB_STEPS = [[240, 0.62], [200, 0.55], [160, 0.5]];

const err = (code, message) => Object.assign(new Error(message || code), { code });

const startsWithAscii = (bytes, text) => text.split("").every((c, i) => bytes[i] === c.charCodeAt(0));
const isZip = (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // "PK\x03\x04"
const isPlainText = (bytes) => !bytes.subarray(0, 4096).includes(0); // binary files contain NUL bytes

export const FILE_TYPES = {
  pdf: { mime: "application/pdf", matches: (b) => startsWithAscii(b, "%PDF-") },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", matches: isZip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", matches: isZip },
  csv: { mime: "text/csv", matches: isPlainText },
  txt: { mime: "text/plain", matches: isPlainText },
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((ext) => "." + ext).join(",");

export function attachmentErrorMessage(e) {
  switch (e && e.code) {
    case "app/bad-type":
      return "That type of file cannot be sent. You can send pictures, PDF, Word (.docx), Excel (.xlsx), CSV or text files.";
    case "app/image-too-big":
      return "That picture is too large. Try a smaller one or a screenshot.";
    case "app/bad-image":
      return "That picture could not be read. Try a JPG or PNG instead.";
    case "app/file-too-big":
      return `That file is too large. Files can be up to ${formatFileSize(MAX_FILE_BYTES)}.`;
    case "app/bad-file":
      return "That file could not be read, or it is not really the type its name says.";
    default:
      return "Could not prepare that attachment. Please try again.";
  }
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const extOf = (name) => {
  const dot = String(name || "").lastIndexOf(".");
  return dot > 0 ? String(name).slice(dot + 1).toLowerCase() : "";
};

const looksLikeImage = (file) =>
  !!file && (/^image\//i.test(file.type || "") || (!file.type && /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name || "")));

const isAllowedFile = (file) => !!file && Object.prototype.hasOwnProperty.call(FILE_TYPES, extOf(file.name));

/** A display-safe file name: no path, no control or reserved characters, at most MAX_FILE_NAME characters, extension kept. */
export function safeFileName(name) {
  const base = String(name || "file")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  const stem = dot > 0 ? base.slice(0, dot) : base;
  // Cut by UTF-16 length (what the security rules count) without leaving half of an emoji at the end.
  const cut = stem.slice(0, MAX_FILE_NAME - ext.length);
  const lastUnit = cut.charCodeAt(cut.length - 1);
  const whole = lastUnit >= 0xd800 && lastUnit <= 0xdbff ? cut.slice(0, -1) : cut; // drop a lone high surrogate
  return (whole + ext) || "file";
}

/** Decode to something drawable. createImageBitmap applies EXIF orientation; <img> is the fallback. */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close && bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(err("app/bad-image"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth || 1024, height: img.naturalHeight || 1024, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function encode(dec, maxSide, quality) {
  // Bound by area too, so a very tall screenshot keeps a readable width instead of shrinking to a sliver.
  const scale = Math.min(1, (maxSide * 2) / Math.max(dec.width, dec.height), Math.sqrt((maxSide * maxSide * 0.75) / (dec.width * dec.height)));
  const w = Math.max(1, Math.round(dec.width * scale));
  const h = Math.max(1, Math.round(dec.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw err("app/bad-image");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high"; // big photos are shrunk a lot in one step
  ctx.fillStyle = "#ffffff"; // JPEG has no alpha: flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(dec.source, 0, 0, w, h);
  const url = canvas.toDataURL("image/jpeg", quality);
  canvas.width = canvas.height = 0; // free the pixel buffer right away
  if (!url.startsWith(JPEG_PREFIX)) throw err("app/bad-image");
  return { url, w, h };
}

/** @returns {Promise<{kind: "image", full: string, thumb: string, width: number, height: number}>} */
export async function prepareImage(file) {
  if (!looksLikeImage(file)) throw err("app/bad-type");
  if (file.size > MAX_INPUT_BYTES) throw err("app/image-too-big");
  const dec = await decode(file);
  try {
    let full = null;
    for (const [side, q] of FULL_STEPS) {
      const out = encode(dec, side, q);
      if (out.url.length <= MAX_FULL_CHARS) { full = out; break; }
    }
    if (!full) throw err("app/image-too-big");
    let thumb = null;
    for (const [side, q] of THUMB_STEPS) {
      const out = encode(dec, side, q);
      if (out.url.length <= MAX_THUMB_CHARS) { thumb = out; break; }
    }
    if (!thumb) throw err("app/image-too-big");
    return { kind: "image", full: full.url, thumb: thumb.url, width: full.w, height: full.h };
  } finally {
    dec.release();
  }
}

/** @returns {Promise<{kind: "file", data: string, name: string, size: number, mime: string}>} */
export async function prepareFile(file) {
  if (!isAllowedFile(file)) throw err("app/bad-type");
  if (file.size > MAX_FILE_BYTES) throw err("app/file-too-big");
  if (file.size === 0) throw err("app/bad-file");
  const type = FILE_TYPES[extOf(file.name)];
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw err("app/bad-file");
  }
  if (!type.matches(bytes)) throw err("app/bad-file");
  let binary = "";
  const CHUNK = 0x8000; // String.fromCharCode cannot take the whole array at once
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return { kind: "file", data: `data:${type.mime};base64,${btoa(binary)}`, name: safeFileName(file.name), size: bytes.length, mime: type.mime };
}

/** A picture is compressed; a document is checked and kept as it is. */
export const prepareAttachment = (file) => (looksLikeImage(file) ? prepareImage(file) : prepareFile(file));

/** The first thing in a file list / clipboard / drop that can be sent: a picture, else an allowed document. */
export function firstAttachableFile(fileList) {
  const files = Array.from(fileList || []);
  return files.find(looksLikeImage) || files.find(isAllowedFile) || null;
}

/**
 * Hook for the composer: one pending attachment at a time.
 *   draft  {kind: "image", full, thumb, width, height} | {kind: "file", data, name, size, mime} | null
 *   busy   true while preparing
 *   error  friendly message | ""
 *   pick(fileOrFileList)  prepare an attachment (shows an error for types that cannot be sent)
 *   clear()
 */
export function useAttachmentDraft() {
  const [state, setState] = useState({ draft: null, busy: false, error: "" });
  const ticket = useRef(0);

  const pick = useCallback(async (input) => {
    const file = input && typeof input.length === "number" && !input.type ? firstAttachableFile(input) : input;
    if (!file) {
      // Something that cannot be sent changes nothing about an attachment that is already preparing or waiting.
      setState((s) => ({ ...s, error: attachmentErrorMessage({ code: "app/bad-type" }) }));
      return;
    }
    const mine = ++ticket.current;
    setState({ draft: null, busy: true, error: "" });
    try {
      const draft = await prepareAttachment(file);
      if (mine === ticket.current) setState({ draft, busy: false, error: "" });
    } catch (e) {
      if (mine === ticket.current) setState({ draft: null, busy: false, error: attachmentErrorMessage(e) });
    }
  }, []);

  const clear = useCallback(() => {
    ticket.current += 1; // abandon any preparation still running
    setState({ draft: null, busy: false, error: "" });
  }, []);

  return { ...state, pick, clear };
}
