const SPREADSHEET_ID = '1cGynN7kC_tVO0voAJUuIkvodczlFyAqAv2DZrHUwz1k';
const SHEET_NAME = '2026 수요출석부';
const HEADER_ROW = 1;
const SUMMARY_ROW = 2;
const FIRST_MEMBER_ROW = 3;
const NICKNAME_COL = 2; // B
const FIRST_DATE_COL = 7; // G

function doGet(e) {
  const action = String(e.parameter.action || '').trim();
  const dateText = normalizeDate_(e.parameter.date || new Date());

  if (action === 'list') {
    return json_({
      ok: true,
      date: dateText,
      attendees: getAttendees_(dateText),
    });
  }

  return json_({ ok: true, message: 'NOBACK attendance endpoint' });
}

function doPost(e) {
  const params = e.parameter || {};
  const action = String(params.action || 'toggle').trim();
  const nickname = String(params.nickname || '').trim();
  const dateText = normalizeDate_(params.date || new Date());
  const present = String(params.present || 'true').toLowerCase() !== 'false';

  if (action !== 'toggle') {
    return json_({ ok: false, message: 'unknown action' });
  }
  if (!nickname) {
    return json_({ ok: false, message: 'nickname is required' });
  }

  const result = setAttendance_(nickname, dateText, present);
  return json_({
    ok: true,
    nickname,
    date: dateText,
    present,
    row: result.row,
    col: result.col,
  });
}

function setAttendance_(nickname, dateText, present) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`sheet not found: ${SHEET_NAME}`);

  const row = findNicknameRow_(sheet, nickname);
  const col = findDateCol_(sheet, dateText);
  sheet.getRange(row, col).setValue(Boolean(present));
  return { row, col };
}

function getAttendees_(dateText) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`sheet not found: ${SHEET_NAME}`);

  const col = findDateCol_(sheet, dateText);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_MEMBER_ROW) return [];

  const names = sheet.getRange(FIRST_MEMBER_ROW, NICKNAME_COL, lastRow - FIRST_MEMBER_ROW + 1, 1).getValues().flat();
  const checks = sheet.getRange(FIRST_MEMBER_ROW, col, lastRow - FIRST_MEMBER_ROW + 1, 1).getValues().flat();

  return names
    .map((name, index) => ({ name: String(name || '').trim(), checked: checks[index] === true }))
    .filter(item => item.name && item.checked)
    .map(item => item.name);
}

function findNicknameRow_(sheet, nickname) {
  const lastRow = sheet.getLastRow();
  const names = sheet.getRange(FIRST_MEMBER_ROW, NICKNAME_COL, lastRow - FIRST_MEMBER_ROW + 1, 1).getValues().flat();
  const target = normalizeName_(nickname);
  const index = names.findIndex(name => normalizeName_(name) === target);
  if (index < 0) throw new Error(`nickname not found: ${nickname}`);
  return FIRST_MEMBER_ROW + index;
}

function findDateCol_(sheet, dateText) {
  const lastCol = sheet.getLastColumn();
  const target = normalizeDate_(dateText);
  const headers = sheet.getRange(HEADER_ROW, FIRST_DATE_COL, 1, lastCol - FIRST_DATE_COL + 1).getValues()[0];
  const index = headers.findIndex(value => normalizeDate_(value) === target);
  if (index < 0) throw new Error(`date column not found: ${dateText}`);
  return FIRST_DATE_COL + index;
}

function normalizeName_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }

  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Seoul', 'yyyy-MM-dd');
  }

  throw new Error(`invalid date: ${value}`);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
