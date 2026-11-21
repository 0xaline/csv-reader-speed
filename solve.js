// A faster drop-in for csv-reader 1.0.0: run(input) returns csv-reader's exact
// reading of {text, header} — {columns, rows, errors} — on every input, broken
// rows included. Written from the published reading policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled
//     ("" inside it is one quote, and each CRLF or lone CR inside it reads as LF);
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that never
//     closes is a literal character and the text after it is read again as
//     unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows are
//     padded (short_row) or cut (long_row) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line
//     its record starts on, row its record's index in rows (null for the header).
//
// Speed: the common field is unquoted, so it is taken with one scan and one
// slice(); only a field that opens with a quote takes the segment path, and
// only the rare field with a stray CR is built from segments. Nothing is kept
// from one call to the next.

const COMMA_END = 0;
const BREAK_END = 1;
const EOF_END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of a record carries these two.
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended: COMMA_END, BREAK_END or EOF_END.
  let fEnded = EOF_END;

  // Joins an unquoted field's kept pieces: v plus the run text[start..j),
  // where segs (when a stray CR split the run) holds the earlier pieces.
  function finishUnquoted(v, segs, start, j) {
    if (segs === null) return v + text.slice(start, j);
    segs.push(text.slice(start, j));
    return v + segs.join('');
  }

  // Reads unquoted characters onto v up to the next comma or line break: a CR
  // not followed by LF is dropped (stray_cr). Returns the field; fEnded says
  // how it ended.
  function readUnquoted(v) {
    let j = pos;
    let start = pos;
    let segs = null;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === 44) {
        pos = j + 1;
        fEnded = COMMA_END;
        return finishUnquoted(v, segs, start, j);
      }
      if (c === 10) {
        pos = j + 1;
        line += 1;
        fEnded = BREAK_END;
        return finishUnquoted(v, segs, start, j);
      }
      if (c === 13) {
        if (text.charCodeAt(j + 1) === 10) {
          pos = j + 2;
          line += 1;
          fEnded = BREAK_END;
          return finishUnquoted(v, segs, start, j);
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (segs === null) segs = [];
        segs.push(text.slice(start, j));
        j += 1;
        start = j;
        continue;
      }
      j += 1;
    }
    pos = j;
    fEnded = EOF_END;
    return finishUnquoted(v, segs, start, j);
  }

  // The quoted segment text[a..b) with each CRLF or lone CR read as LF; counts
  // the lines it spans into `line`. Only called on a segment holding a CR.
  function transformSegment(a, b) {
    let out = '';
    let start = a;
    let k = a;
    while (k < b) {
      const c = text.charCodeAt(k);
      if (c === 13) {
        out += text.slice(start, k) + '\n';
        line += 1;
        k += text.charCodeAt(k + 1) === 10 ? 2 : 1;
        start = k;
      } else {
        if (c === 10) line += 1;
        k += 1;
      }
    }
    return out + text.slice(start, b);
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = pos + 1; // scan cursor, hunting the next quote
    let segStart = i; // start of the current clean segment
    let parts = null; // pieces of the value, once a "" forces a split
    while (true) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      // The segment text[segStart..q): slice it as it stands unless it holds
      // a CR (each CRLF or lone CR inside quotes reads as LF); count its LFs.
      let seg;
      const cr = text.indexOf('\r', segStart);
      if (cr !== -1 && cr < q) {
        seg = transformSegment(segStart, q);
      } else {
        let lf = text.indexOf('\n', segStart);
        while (lf !== -1 && lf < q) {
          line += 1;
          lf = text.indexOf('\n', lf + 1);
        }
        seg = text.slice(segStart, q);
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote, and the field goes on.
        if (parts === null) parts = [];
        parts.push(seg, '"');
        i = q + 2;
        segStart = i;
        continue;
      }
      // The closing quote.
      let value;
      if (parts === null) {
        value = seg;
      } else {
        parts.push(seg);
        value = parts.join('');
      }
      pos = q + 1;
      if (pos >= n) {
        fEnded = EOF_END;
        return value;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fEnded = COMMA_END;
        return value;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fEnded = BREAK_END;
        return value;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fEnded = BREAK_END;
        return value;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const before = value.length;
      const withJunk = readUnquoted(value);
      if (withJunk.length > before) {
        errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      return withJunk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        fields.push(readQuoted());
      } else {
        quoted = false;
        fields.push(readUnquoted(''));
      }
    } while (fEnded === COMMA_END);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
