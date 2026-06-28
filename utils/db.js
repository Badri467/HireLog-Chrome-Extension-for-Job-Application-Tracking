// utils/db.js — IndexedDB wrapper for file handle storage
// (Application data lives in chrome.storage.local; file handles MUST be in IndexedDB)

const FILE_DB_NAME = 'hirelog_file_handles';
const FILE_DB_VERSION = 1;

function openFileHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB_NAME, FILE_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles', { keyPath: 'key' });
      }
    };
  });
}

async function saveFileHandle(handle) {
  const db = await openFileHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put({ key: 'excel_file', handle, name: handle.name });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFileHandle() {
  const db = await openFileHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('excel_file');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearFileHandle() {
  const db = await openFileHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('excel_file');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
