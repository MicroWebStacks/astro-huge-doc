// Minimal reader for the USTAR/PAX tar format npm tarballs use. Supports
// regular files, directories, and PAX/GNU long-name headers, the same subset
// packages/vscode-extension/extension.js's own tar reader supports (that
// copy must stay self-contained inside the shipped VSIX, so it is not
// imported from here - this module is for build-time packaging verification
// only, see scripts/package-extension.js).

function readTarString(block, start, length) {
  const slice = block.subarray(start, start + length);
  const nul = slice.indexOf(0);
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString('utf8');
}

function tarBlockPadding(size) {
  const remainder = size % 512;
  return remainder === 0 ? size : size + (512 - remainder);
}

// PAX extended header records look like "<record-length> <key>=<value>\n",
// back-to-back for as many keys as were overridden for the next entry.
function parsePaxRecords(text) {
  const result = {};
  let i = 0;
  while (i < text.length) {
    const spaceIndex = text.indexOf(' ', i);
    if (spaceIndex === -1) {
      break;
    }
    const recordLength = parseInt(text.slice(i, spaceIndex), 10);
    if (!Number.isFinite(recordLength) || recordLength <= 0) {
      break;
    }
    const record = text.slice(i, i + recordLength);
    const equalsIndex = record.indexOf('=');
    const key = record.slice(spaceIndex - i + 1, equalsIndex);
    const value = record.slice(equalsIndex + 1).replace(/\n$/, '');
    result[key] = value;
    i += recordLength;
  }
  return result;
}

export function parseTarEntries(tarBuffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  let pendingPax = null;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const size = parseInt(readTarString(header, 124, 12).trim() || '0', 8);
    const typeflag = String.fromCharCode(header[156] || 0);
    const dataStart = offset + 512;

    if (typeflag === 'x' || typeflag === 'g') {
      const pax = parsePaxRecords(tarBuffer.subarray(dataStart, dataStart + size).toString('utf8'));
      if (typeflag === 'x') {
        pendingPax = pax;
      }
      offset = dataStart + tarBlockPadding(size);
      continue;
    }

    if (typeflag === 'L') {
      pendingLongName = tarBuffer.subarray(dataStart, dataStart + size).toString('utf8').replace(/\0+$/, '');
      offset = dataStart + tarBlockPadding(size);
      continue;
    }

    const name = readTarString(header, 0, 100);
    const entryName = pendingPax?.path ?? pendingLongName ?? name;
    const entrySize = pendingPax?.size ? parseInt(pendingPax.size, 10) : size;
    pendingLongName = null;
    pendingPax = null;

    if (typeflag === '5') {
      entries.push({name: entryName, type: 'directory'});
    } else if (typeflag === '0' || typeflag === '\0') {
      entries.push({name: entryName, type: 'file', data: tarBuffer.subarray(dataStart, dataStart + entrySize)});
    }
    // Other typeflags (symlinks, hard links, device files) are ignored.

    offset = dataStart + tarBlockPadding(entrySize);
  }
  return entries;
}
