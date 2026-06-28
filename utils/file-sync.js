// utils/file-sync.js — File System Access API wrapper
// Manages the linked Excel/CSV file for persistent auto-sync

// ──────────────────────────────────────────────
// Link a new CSV/Excel file
// Opens a save file picker so the user chooses the location.
// The file handle is stored in IndexedDB for future writes.
// ──────────────────────────────────────────────

async function linkExcelFile() {
  if (!('showSaveFilePicker' in window)) {
    alert('Your browser does not support the File System Access API.\nPlease use Chrome 86+ to use this feature.');
    return null;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'HireLog_Applications.csv',
      types: [
        {
          description: 'CSV File (opens in Excel)',
          accept: { 'text/csv': ['.csv'] },
        },
      ],
      startIn: 'documents',
    });

    await saveFileHandle(handle);
    return handle.name;
  } catch (e) {
    if (e.name === 'AbortError') return null; // user cancelled
    console.error('HireLog: Error linking file:', e);
    throw e;
  }
}

// ──────────────────────────────────────────────
// Sync all applications to the linked file
// Creates the file if new; overwrites with full dataset if existing.
// (Effectively "append" because the dataset always grows.)
// ──────────────────────────────────────────────

async function syncToExcelFile(applications) {
  const record = await getFileHandle();
  if (!record) return false;

  const handle = record.handle;

  try {
    // Verify / request write permission
    const permStatus = await handle.queryPermission({ mode: 'readwrite' });
    if (permStatus !== 'granted') {
      const requested = await handle.requestPermission({ mode: 'readwrite' });
      if (requested !== 'granted') {
        console.warn('HireLog: Write permission denied.');
        return false;
      }
    }

    const csvContent = generateCSV(applications);
    const writable = await handle.createWritable();
    await writable.write(csvContent);
    await writable.close();

    return true;
  } catch (e) {
    // Handle common errors gracefully
    if (e.name === 'NotFoundError') {
      // File was deleted — clear the stored handle
      await clearFileHandle();
      console.warn('HireLog: Linked file was deleted. Handle cleared.');
    } else {
      console.error('HireLog: File sync error:', e);
    }
    return false;
  }
}

// ──────────────────────────────────────────────
// Get the name of the linked file (or null)
// ──────────────────────────────────────────────

async function getLinkedFileName() {
  const record = await getFileHandle();
  return record ? record.name : null;
}

// ──────────────────────────────────────────────
// Unlink the current file
// ──────────────────────────────────────────────

async function unlinkExcelFile() {
  await clearFileHandle();
}

// ──────────────────────────────────────────────
// Manual download fallback (no file handle needed)
// Triggers a browser download of the CSV
// ──────────────────────────────────────────────

function downloadCSV(applications, filename = 'HireLog_Applications.csv') {
  const csv = generateCSV(applications);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
