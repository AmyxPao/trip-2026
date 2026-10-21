/**
 * 北陸自駕 8 日：帳本雲端同步（Google Apps Script）
 *
 * 用法：
 * 1. 建一個新的 Google 試算表 → 擴充功能 → Apps Script，把這整份貼上（取代原本的內容）。
 * 2. 把下面 SECRET 改成你自己的一組密語（App 設定裡要填一樣的）。
 * 3. 部署 → 新增部署作業 → 類型選「網頁應用程式」：
 *    執行身分＝我、誰可以存取＝任何人 → 部署 → 授權 → 複製「網頁應用程式網址」。
 * 4. 到 App 的「分帳 → 設定 → 雲端同步」貼上網址與密語。
 *
 * 試算表會出現兩張工作表：「帳本」（一筆帳一列，方便看與篩選）、「設定」（分類、卡片、匯率、稱呼）。
 * 請不要手動改「json」欄與「設定」工作表；要改帳請在 App 裡改。
 */
const SECRET = '請改成你自己的密語';

const HEAD = ['id', '更新時間', '已刪除', '日期', '分類', '金額', '幣別', '誰付', '付款方式', '分攤', '備註', '帳單台幣', 'json'];
const JSON_COL = HEAD.length - 1;

function doGet() {
  return out({ ok: true, app: 'hokuriku-ledger', message: '同步程式已部署。請在 App 裡設定這個網址。' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    if (req.secret !== SECRET) return out({ ok: false, error: '密語不對，請確認 App 設定裡的密語和程式裡的 SECRET 一樣。' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const entries = mergeEntries(sheetOf(ss, '帳本', HEAD), req.entries || [], req.labels || {});
    const settings = mergeSettings(sheetOf(ss, '設定', ['json', '更新時間']), req.settings);
    return out({ ok: true, entries: entries, settings: settings, serverTime: new Date().toISOString() });
  } catch (err) {
    return out({ ok: false, error: '同步程式出錯：' + err.message });
  } finally {
    lock.releaseLock();
  }
}

// 以 id 合併；同一筆以 updatedAt 較新的為準
function mergeEntries(sh, incoming, labels) {
  const n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 1, n, HEAD.length).getValues() : [];
  const index = {};
  rows.forEach(function (r, i) { index[r[0]] = i; });
  const appends = [];
  incoming.forEach(function (en) {
    if (!en || !en.id) return;
    const row = toRow(en, labels);
    if (Object.prototype.hasOwnProperty.call(index, en.id)) {
      const i = index[en.id];
      const cur = parse(rows[i][JSON_COL]);
      if ((en.updatedAt || '') > (cur.updatedAt || '')) {
        rows[i] = row;
        sh.getRange(i + 2, 1, 1, HEAD.length).setValues([row]);
      }
    } else {
      index[en.id] = rows.length;
      rows.push(row);
      appends.push(row);
    }
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, HEAD.length).setValues(appends);
  return rows.map(function (r) { return parse(r[JSON_COL]); }).filter(function (x) { return x.id; });
}

function mergeSettings(sh, incoming) {
  const cur = sh.getLastRow() >= 2 ? { data: parse(sh.getRange(2, 1).getValue()), updatedAt: String(sh.getRange(2, 2).getValue()) } : null;
  if (incoming && incoming.data && (!cur || (incoming.updatedAt || '') > (cur.updatedAt || ''))) {
    sh.getRange(2, 1, 1, 2).setValues([[JSON.stringify(incoming.data), incoming.updatedAt || '']]);
    return incoming;
  }
  return cur;
}

function toRow(en, labels) {
  const cats = labels.cats || {};
  const cards = labels.cards || {};
  const names = labels.names || {};
  const split = en.split || {};
  const splitText = split.type === 'me' ? '全算' + (names.me || '我')
    : split.type === 'mate' ? '全算' + (names.mate || '旅伴')
      : split.type === 'custom' ? (names.me || '我') + ' ' + split.me + '%' : '對半';
  return [
    en.id,
    en.updatedAt || '',
    en.deleted ? '是' : '',
    en.date === 'pre' ? '出發前' : "'" + en.date,
    cats[en.cat] || en.cat || '',
    Number(en.amount) || 0,
    en.currency === 'TWD' ? '台幣' : '日圓',
    en.payer === 'mate' ? (names.mate || '旅伴') : (names.me || '我'),
    en.method === 'cash' ? '現金' : (cards[en.method] || en.method || ''),
    splitText,
    en.note || '',
    en.billTWD || '',
    JSON.stringify(en),
  ];
}

function sheetOf(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function parse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
