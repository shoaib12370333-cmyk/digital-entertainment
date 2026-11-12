// Live-chat data layer. Everything that touches Firebase for chat lives here so the
// UI components (ChatWidget.jsx, AdminChat.jsx) only deal with plain objects.
//
// Data model (Firestore):
//   digitalEntertainment_chats/{uid}                 one conversation per chat user (doc id == their auth uid)
//     uid, name, isGuest, lastMessage, lastMessageAt, lastActivityAt, lastSender ("user"|"admin"),
//     lastOpenedAt, lastSeenAt, unreadAdmin (# user msgs admin hasn't read), unreadUser (# admin msgs user hasn't read)
//   digitalEntertainment_chats/{uid}/messages/{id}   uid, sender ("user"|"admin"), text, createdAt (server time),
//                                                    and for an attachment either imageId + thumb or fileId + fileName + fileSize + fileMime
//   digitalEntertainment_chats/{uid}/images/{id}     the full-size picture of a picture message (same id as the message)
//   digitalEntertainment_chats/{uid}/files/{id}      the file of a file message (same id as the message)
//   digitalEntertainment_admins/{uid}                marker doc created by hand in the console; makes that uid the admin
//
// Identity: chat users are Firebase Auth users that are EITHER anonymous (guests) OR password
// users whose synthetic email is "<username>@chat.digital.example". Anyone else who is signed in
// is shown the admin UI, but the real admin check is enforced in firestore.rules via digitalEntertainment_admins/{uid}.

import { useState, useEffect, useRef } from "react";
import {
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { JPEG_PREFIX, MAX_FILE_BYTES, MAX_FILE_NAME, attachmentErrorMessage } from "./imageTools.js";

const CHATS = "digitalEntertainment_chats";
const ADMINS = "digitalEntertainment_admins";
export const CHAT_EMAIL_DOMAIN = "chat.digital.example";
export const MAX_MESSAGE_LENGTH = 1000;
export const MIN_PASSWORD_LENGTH = 8;
const SEND_COOLDOWN_MS = 800;
const RESERVED_USERNAMES = ["admin", "administrator", "support", "staff", "digital", "digitalentertainment", "owner", "mod", "moderator", "system", "root", "official"];

/* ---------- identity helpers ---------- */
export const normalizeUsername = (u) => String(u || "").trim().toLowerCase();
export const validateUsername = (u) => /^[a-z0-9_]{3,20}$/.test(normalizeUsername(u));
export const isReservedUsername = (u) => RESERVED_USERNAMES.includes(normalizeUsername(u));
export const usernameToEmail = (u) => `${normalizeUsername(u)}@${CHAT_EMAIL_DOMAIN}`;

/** True for guests (anonymous) and username/password chat accounts. */
export function isChatUser(user) {
  return !!user && (user.isAnonymous || String(user.email || "").endsWith("@" + CHAT_EMAIL_DOMAIN));
}
/** Any signed-in user that is not a chat user is treated as the admin by the UI (rules decide for real). */
export function isAdminUser(user) {
  return !!user && !isChatUser(user);
}
/** {uid, name, isGuest} for a chat user, or null for signed-out / admin. */
export function chatIdentity(user) {
  if (!isChatUser(user)) return null;
  const isGuest = !!user.isAnonymous;
  const name = isGuest
    ? (user.displayName || "Guest " + user.uid.slice(-4).toUpperCase())
    : String(user.email).split("@")[0];
  return { uid: user.uid, name, isGuest };
}

/* linkWithCredential does not fire onAuthStateChanged, so we keep our own listeners
   and emit after every action that changes who the chat user is. */
const identityListeners = new Set();
function emitIdentity() {
  const id = chatIdentity(auth.currentUser);
  identityListeners.forEach((fn) => fn(id));
}
let authBridgeStarted = false;
function startAuthBridge() {
  if (authBridgeStarted) return;
  authBridgeStarted = true;
  onAuthStateChanged(auth, () => emitIdentity());
}

/** Hook: current chat identity ({uid,name,isGuest} | null) and whether Firebase has reported yet. */
export function useChatIdentity() {
  const [state, setState] = useState({ identity: chatIdentity(auth.currentUser), ready: false });
  useEffect(() => {
    startAuthBridge();
    const fn = (identity) => setState({ identity, ready: true });
    identityListeners.add(fn);
    // onAuthStateChanged calls back asynchronously the first time; resolve "ready" from it.
    const unsub = onAuthStateChanged(auth, () => fn(chatIdentity(auth.currentUser)));
    return () => {
      identityListeners.delete(fn);
      unsub();
    };
  }, []);
  return state;
}

/* ---------- friendly errors ---------- */
export function chatErrorMessage(err) {
  const code = (err && err.code) || "";
  switch (code) {
    case "auth/email-already-in-use":
    case "auth/credential-already-in-use":
      return "That username is already taken. Pick another one.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
    case "auth/missing-password":
      return "Wrong username or password.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `Password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a minute and try again.";
    case "auth/network-request-failed":
    case "unavailable":
      return "Network problem. Check your connection and try again.";
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return "This sign-in method is not enabled yet. Please contact support another way.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Chat is not available right now. Please try again later.";
    case "app/bad-username":
      return "Username must be 3-20 letters, numbers or underscores.";
    case "app/reserved-name":
      return "That username is reserved. Pick another one.";
    case "app/slow-down":
      return "You're sending messages too fast. Wait a second.";
    case "app/empty":
      return "Type a message first.";
    case "app/admin-session":
      return "You are signed in as admin in this browser. Use a different browser to test chat.";
    case "app/bad-type":
    case "app/image-too-big":
    case "app/bad-image":
    case "app/file-too-big":
    case "app/bad-file":
      return attachmentErrorMessage(err);
    case "app/image-gone":
      return "This picture is no longer available.";
    case "app/file-gone":
      return "This file is no longer available.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const appError = (code, message) => Object.assign(new Error(message || code), { code });

function refuseOnAdminSession() {
  if (isAdminUser(auth.currentUser)) throw appError("app/admin-session");
}

/* ---------- auth actions ---------- */
export async function continueAsGuest(displayName) {
  refuseOnAdminSession();
  const cred = await signInAnonymously(auth);
  const clean = String(displayName || "").trim().slice(0, 30);
  if (clean) {
    try {
      await updateProfile(cred.user, { displayName: clean });
    } catch {
      /* the name is cosmetic; the guest is already signed in */
    }
  }
  emitIdentity();
  return chatIdentity(auth.currentUser);
}

/** Create an account. If the visitor is currently a guest, the guest is upgraded in place (same uid, history kept). */
export async function registerAccount(username, password) {
  refuseOnAdminSession();
  const u = normalizeUsername(username);
  if (!validateUsername(u)) throw appError("app/bad-username");
  if (isReservedUsername(u)) throw appError("app/reserved-name");
  if (String(password || "").length < MIN_PASSWORD_LENGTH) throw appError("auth/weak-password");
  const email = usernameToEmail(u);
  const current = auth.currentUser;
  try {
    if (current && current.isAnonymous) {
      await linkWithCredential(current, EmailAuthProvider.credential(email, password));
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
  } finally {
    emitIdentity();
  }
  return chatIdentity(auth.currentUser);
}

export async function loginAccount(username, password) {
  refuseOnAdminSession();
  const u = normalizeUsername(username);
  if (!u || !password) throw appError("auth/invalid-credential");
  await signInWithEmailAndPassword(auth, usernameToEmail(u), password);
  emitIdentity();
  return chatIdentity(auth.currentUser);
}

export async function logoutChat() {
  await signOut(auth);
  emitIdentity();
}

/* ---------- normalizers ---------- */
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" && Number.isFinite(t) ? t : 0);
const clampCount = (n) => Math.max(0, Math.min(999, Math.floor(Number(n)) || 0));

function normalizeChat(snap) {
  const d = snap.data({ serverTimestamps: "estimate" }) || {};
  return {
    id: snap.id,
    uid: d.uid || snap.id,
    name: typeof d.name === "string" && d.name ? d.name.slice(0, 40) : "Guest",
    isGuest: d.isGuest !== false,
    lastMessage: typeof d.lastMessage === "string" ? d.lastMessage.slice(0, 120) : "",
    lastMessageAt: ms(d.lastMessageAt),
    lastActivityAt: ms(d.lastActivityAt),
    lastOpenedAt: ms(d.lastOpenedAt),
    lastSeenAt: ms(d.lastSeenAt),
    lastSender: d.lastSender === "admin" ? "admin" : d.lastSender === "user" ? "user" : "",
    unreadAdmin: clampCount(d.unreadAdmin),
    unreadUser: clampCount(d.unreadUser),
  };
}

function normalizeMessage(snap) {
  const d = snap.data({ serverTimestamps: "estimate" }) || {};
  return {
    id: snap.id,
    sender: d.sender === "admin" ? "admin" : "user",
    text: String(d.text || ""),
    createdAt: ms(d.createdAt) || Date.now(),
    pending: snap.metadata.hasPendingWrites,
    // A picture message carries a small inline thumbnail; the full image is fetched on demand (loadChatImage).
    thumb: typeof d.thumb === "string" && d.thumb.startsWith(JPEG_PREFIX) ? d.thumb : "",
    imageId: typeof d.imageId === "string" ? d.imageId : "",
    // A file message carries its name and size; the file itself is fetched on demand (loadChatFile).
    fileId: typeof d.fileId === "string" ? d.fileId : "",
    fileName: typeof d.fileName === "string" ? d.fileName.slice(0, MAX_FILE_NAME) : "",
    fileSize: Number.isFinite(d.fileSize) ? d.fileSize : 0,
    edited: !!d.editedAt,
  };
}

const chatRef = (chatId) => doc(db, CHATS, chatId);
const messagesCol = (chatId) => collection(db, CHATS, chatId, "messages");
const imagesCol = (chatId) => collection(db, CHATS, chatId, "images");
const filesCol = (chatId) => collection(db, CHATS, chatId, "files");

/** Truncate by code points so an emoji is never split into a lone surrogate. */
const cut = (s, n) => Array.from(s).slice(0, n).join("");

function cleanText(text, allowEmpty = false) {
  const t = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[​-‍⁠﻿]/g, "")
    .trim();
  if (!t && !allowEmpty) throw appError("app/empty");
  return cut(t, MAX_MESSAGE_LENGTH);
}

/** What the inbox shows for a message: the text, "Photo" / "Photo: caption" for pictures, "File: name" for files. */
function previewFor(t, attachment) {
  if (!attachment) return cut(t, 120);
  if (attachment.kind === "file") return "File: " + cut(attachment.name, 60);
  return t ? "Photo: " + cut(t, 100) : "Photo";
}

/** An image prepared by prepareImage() must be exactly {full, thumb} JPEG data URLs. */
function assertImage(image) {
  if (!image || typeof image.full !== "string" || typeof image.thumb !== "string" || !image.full.startsWith(JPEG_PREFIX) || !image.thumb.startsWith(JPEG_PREFIX)) {
    throw appError("app/bad-image");
  }
}

/** A file prepared by prepareFile() must be {data, name, size, mime} with a data URL of the declared type. */
function assertFile(file) {
  if (
    !file || typeof file.data !== "string" || typeof file.name !== "string" || typeof file.mime !== "string" ||
    !file.name || file.name.length > MAX_FILE_NAME || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES ||
    !file.data.startsWith("data:" + file.mime + ";base64,")
  ) {
    throw appError("app/bad-file");
  }
}

/**
 * Adds the attachment's own document to `batch` (same id as the message, which the security rules require) and returns
 * the extra fields the message itself must carry. Throws app/bad-image or app/bad-file for anything malformed.
 */
function stageAttachment(batch, chatId, authorUid, messageId, attachment) {
  if (attachment.kind === "file") {
    assertFile(attachment);
    batch.set(doc(filesCol(chatId), messageId), {
      uid: authorUid,
      data: attachment.data,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
      createdAt: serverTimestamp(),
    });
    return { fileId: messageId, fileName: attachment.name, fileSize: attachment.size, fileMime: attachment.mime };
  }
  assertImage(attachment);
  batch.set(doc(imagesCol(chatId), messageId), { uid: authorUid, data: attachment.full, createdAt: serverTimestamp() });
  return { imageId: messageId, thumb: attachment.thumb };
}

/* A tiny client-side cooldown for visitors. Real abuse protection needs Firebase App Check (see README). */
let lastSendAt = 0;
function assertNotTooFast() {
  if (Date.now() - lastSendAt < SEND_COOLDOWN_MS) throw appError("app/slow-down");
}

const isMissingDoc = (err) => err && (err.code === "not-found" || err.code === "permission-denied");

/* ---------- user-side actions ---------- */
/** Called when the visitor opens the chat box: makes sure the conversation exists and tells the admin. */
export async function openChat(identity) {
  await setDoc(
    chatRef(identity.uid),
    {
      uid: identity.uid,
      name: identity.name,
      isGuest: identity.isGuest,
      lastOpenedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Keeps "online" fresh while the chat box is open. Re-creates the conversation if the admin deleted it. */
export async function heartbeat(identity) {
  try {
    await updateDoc(chatRef(identity.uid), { lastSeenAt: serverTimestamp() });
  } catch (err) {
    if (!isMissingDoc(err)) throw err;
    await openChat(identity);
  }
}

/**
 * Send a message as the visitor. `attachment` is the optional result of prepareImage() or prepareFile(); with an
 * attachment the text is just a caption and may be empty. A picture goes into its own document (loaded on demand)
 * and the message keeps only a small thumbnail; a file goes into its own document and the message keeps its name and
 * size. All of it is ONE batch (the rules require that). The attachment document id IS the message id: the rules tie
 * each one to exactly one message.
 */
export async function sendUserMessage(identity, text, attachment = null) {
  const t = cleanText(text, !!attachment);
  assertNotTooFast();
  const batch = writeBatch(db);
  const mRef = doc(messagesCol(identity.uid));
  const msg = { uid: identity.uid, sender: "user", text: t, createdAt: serverTimestamp() };
  if (attachment) Object.assign(msg, stageAttachment(batch, identity.uid, identity.uid, mRef.id, attachment));
  batch.set(mRef, msg);
  batch.set(
    chatRef(identity.uid),
    {
      uid: identity.uid,
      name: identity.name,
      isGuest: identity.isGuest,
      lastMessage: previewFor(t, attachment),
      lastMessageAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      lastSender: "user",
      unreadAdmin: increment(1),
    },
    { merge: true }
  );
  await batch.commit();
  lastSendAt = Date.now();
}

export async function markReadByUser(identity) {
  try {
    await updateDoc(chatRef(identity.uid), { unreadUser: 0 });
  } catch (err) {
    if (!isMissingDoc(err)) throw err; // nothing to mark read if the conversation does not exist
  }
}

/* ---------- admin-side actions ---------- */
export async function sendAdminMessage(chatId, text, attachment = null) {
  const t = cleanText(text, !!attachment);
  const batch = writeBatch(db);
  const adminUid = auth.currentUser ? auth.currentUser.uid : "admin";
  const mRef = doc(messagesCol(chatId));
  const msg = { uid: adminUid, sender: "admin", text: t, createdAt: serverTimestamp() };
  if (attachment) Object.assign(msg, stageAttachment(batch, chatId, adminUid, mRef.id, attachment));
  batch.set(mRef, msg);
  batch.update(chatRef(chatId), {
    lastMessage: previewFor(t, attachment),
    lastMessageAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    lastSender: "admin",
    unreadUser: increment(1),
  });
  await batch.commit();
}

/** Admin only: change the text of a message the admin sent. Pictures and files keep their attachment; only the words change. */
export async function editAdminMessage(chatId, messageId, text) {
  const t = cleanText(text, false);
  await updateDoc(doc(messagesCol(chatId), messageId), { text: t, editedAt: serverTimestamp() });
}

export async function markReadByAdmin(chatId) {
  await updateDoc(chatRef(chatId), { unreadAdmin: 0 });
}

/** Deletes a conversation with all of its messages, pictures and files. The chat doc goes first so it stops showing up straight away. */
export async function deleteChat(chatId) {
  await deleteDoc(chatRef(chatId));
  for (const col of [messagesCol(chatId), imagesCol(chatId), filesCol(chatId)]) {
    for (let round = 0; round < 300; round += 1) {
      // getDocs downloads whole documents and a picture or file is up to ~700 KB, so read only a few at a time.
      const snap = await getDocs(query(col, limit(col.id === "messages" ? 400 : 15)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

/* Full-size pictures are fetched only when someone opens one, then kept for the session. */
const imageCache = new Map();
const IMAGE_CACHE_MAX = 24;

/** Resolves to the full-size JPEG data URL of a picture message. */
export async function loadChatImage(chatId, imageId) {
  const key = chatId + "/" + imageId;
  if (imageCache.has(key)) return imageCache.get(key);
  const snap = await getDoc(doc(imagesCol(chatId), imageId));
  if (!snap.exists()) throw appError("app/image-gone");
  const data = snap.data().data;
  if (typeof data !== "string" || !data.startsWith(JPEG_PREFIX)) throw appError("app/bad-image");
  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
  imageCache.set(key, data);
  return data;
}

/** Fetches a file message's file and returns it as a Blob typed application/octet-stream, so it can only be saved, never rendered. */
export async function loadChatFile(chatId, fileId) {
  const snap = await getDoc(doc(filesCol(chatId), fileId));
  if (!snap.exists()) throw appError("app/file-gone");
  const data = snap.data().data;
  const marker = typeof data === "string" ? data.indexOf(";base64,") : -1;
  if (marker < 0) throw appError("app/bad-file");
  const binary = atob(data.slice(marker + ";base64,".length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/octet-stream" });
}

/* ---------- hooks ---------- */
/** Live message list for one conversation (oldest first). */
export function useChatMessages(chatId) {
  const [state, setState] = useState({ messages: [], loading: !!chatId, error: null });
  useEffect(() => {
    if (!chatId) {
      setState({ messages: [], loading: false, error: null });
      return undefined;
    }
    setState({ messages: [], loading: true, error: null });
    const q = query(messagesCol(chatId), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(
      q,
      (snap) => setState({ messages: snap.docs.map(normalizeMessage).reverse(), loading: false, error: null }),
      (error) => setState({ messages: [], loading: false, error })
    );
  }, [chatId]);
  return state;
}

/** The visitor's own conversation doc (for unread counts). Never returns another visitor's doc. */
export function useOwnChat(identity) {
  const [state, setState] = useState({ uid: null, chat: null });
  const uid = identity ? identity.uid : null;
  useEffect(() => {
    if (!uid) { setState({ uid: null, chat: null }); return undefined; }
    setState({ uid, chat: null });
    return onSnapshot(
      chatRef(uid),
      (snap) => setState({ uid, chat: snap.exists() ? normalizeChat(snap) : null }),
      () => setState({ uid, chat: null })
    );
  }, [uid]);
  return state.uid === uid ? state.chat : null;
}

/**
 * Admin: live list of all conversations (most recent first) plus event callbacks.
 * onEvent({type: "opened" | "message", chat}) fires for changes after the first server snapshot.
 */
export function useAdminChats(onEvent) {
  const [state, setState] = useState({ chats: [], loading: true, error: null });
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const prev = new Map();
    let baselined = false;
    let baselineMax = 0;
    const q = query(collection(db, CHATS), orderBy("lastActivityAt", "desc"), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        const chats = snap.docs.map(normalizeChat);
        if (!baselined) {
          // A cache-only first snapshot may be empty or stale; wait for the server before alerting.
          chats.forEach((c) => {
            prev.set(c.id, c);
            baselineMax = Math.max(baselineMax, c.lastActivityAt);
          });
          if (!snap.metadata.fromCache) baselined = true;
        } else {
          snap.docChanges().forEach((ch) => {
            if (ch.type === "removed") { prev.delete(ch.doc.id); return; }
            const c = normalizeChat(ch.doc);
            const old = prev.get(c.id);
            if (handler.current) {
              if (!old) {
                // Conversations that merely re-entered the 200-doc window are not news.
                if (c.lastActivityAt > baselineMax) handler.current({ type: c.lastSender === "user" ? "message" : "opened", chat: c });
              } else if (c.lastSender === "user" && (c.unreadAdmin > old.unreadAdmin || c.lastMessageAt > old.lastMessageAt)) {
                handler.current({ type: "message", chat: c });
              } else if (c.lastOpenedAt - old.lastOpenedAt > 60000) {
                handler.current({ type: "opened", chat: c });
              }
            }
            prev.set(c.id, c);
          });
        }
        setState({ chats, loading: false, error: null });
      },
      (error) => setState({ chats: [], loading: false, error })
    );
  }, []);

  const unreadTotal = state.chats.reduce((n, c) => n + c.unreadAdmin, 0);
  return { ...state, unreadTotal };
}

/**
 * Admin: does digitalEntertainment_admins/{my-uid} exist? Rules only let you read your own marker.
 *   "checking" - still loading
 *   "ok"       - marker exists
 *   "missing"  - rules are published but the marker is not there (every admin save will be denied)
 *   "unknown"  - the read was denied or failed, e.g. the new rules are not published yet
 */
export function useAdminMarker() {
  const [state, setState] = useState({ status: "checking", uid: auth.currentUser ? auth.currentUser.uid : "" });
  useEffect(() => {
    let cancelled = false;
    const user = auth.currentUser;
    if (!user) { setState({ status: "unknown", uid: "" }); return undefined; }
    getDoc(doc(db, ADMINS, user.uid))
      .then((snap) => { if (!cancelled) setState({ status: snap.exists() ? "ok" : "missing", uid: user.uid }); })
      .catch(() => { if (!cancelled) setState({ status: "unknown", uid: user.uid }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

/** A visitor counts as "online" if their chat box sent a heartbeat in the last 90 seconds. */
export const isOnline = (chat, now = Date.now()) => !!chat && chat.lastSeenAt > 0 && now - chat.lastSeenAt < 90000;
