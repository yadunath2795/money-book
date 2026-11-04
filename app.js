"use strict";

/* =========================================================
   Money Book: offline income and expense tracker.
   All data lives in this phone's browser storage (localStorage).
   ========================================================= */

// ---------- Small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, "0");
const sum = (arr, fn = (x) => x) => round2(arr.reduce((a, x) => a + fn(x), 0));

const moneyWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const money = (n) => (Number.isInteger(round2(n || 0)) ? moneyWhole : moneyCents).format(n || 0);
// Whole rupees, for the big summary numbers
const moneyR = (n) => moneyWhole.format(Math.round(n || 0));

// Short form for charts: ₹1.2k, ₹3.4L, ₹1.1Cr
function compact(n) {
  const a = Math.abs(n);
  const trim = (x) => x.toFixed(1).replace(/\.0$/, "");
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

// ---------- Dates (always local time, stored as YYYY-MM-DD) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const monthOf = (iso) => iso.slice(0, 7);
function addMonths(mk, n) {
  let [y, m] = mk.split("-").map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function daysIn(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function monthLabel(mk) {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function dateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function dayHeading(iso) {
  const today = todayISO();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  const [yy, mm, dd] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(yy, mm - 1, dd).getDay()]}, ${dd} ${MONTHS[mm - 1]}`;
}

// ---------- Data ----------
const STORAGE_KEY = "money-book-data";
const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1",
  "#a855f7", "#ec4899", "#64748b", "#0ea5e9", "#84cc16", "#f43f5e", "#10b981",
];
const DEFAULT_CATEGORIES = [
  ["expense", "Food", "🍔"],
  ["expense", "Groceries", "🛒"],
  ["expense", "Rent", "🏠"],
  ["expense", "Bills", "💡"],
  ["expense", "Travel", "🚕"],
  ["expense", "Shopping", "🛍️"],
  ["expense", "Health", "💊"],
  ["expense", "Entertainment", "🎬"],
  ["expense", "EMI / Loans", "🏦"],
  ["expense", "Education", "📚"],
  ["expense", "Gifts", "🎁"],
  ["expense", "Other", "📦"],
  ["income", "Salary", "💼"],
  ["income", "Freelance", "💻"],
  ["income", "Interest", "📈"],
  ["income", "Refund", "↩️"],
  ["income", "Other income", "💰"],
];
// Keywords used to auto-sort bank statement lines into categories
const DEFAULT_RULES = [
  ["Food", ["swiggy", "zomato", "restaurant", "cafe", "dominos", "mcdonald", "kfc", "starbucks"]],
  ["Groceries", ["bigbasket", "blinkit", "zepto", "dmart", "instamart", "grocery", "reliance fresh"]],
  ["Travel", ["uber", "ola", "rapido", "irctc", "makemytrip", "indigo", "petrol", "fuel", "fastag", "metro"]],
  ["Shopping", ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho"]],
  ["Entertainment", ["netflix", "spotify", "hotstar", "prime video", "bookmyshow", "youtube"]],
  ["Bills", ["electricity", "airtel", "jio", "vodafone", "bsnl", "broadband", "gas", "water bill", "recharge"]],
  ["Health", ["pharmacy", "apollo", "hospital", "clinic", "medplus", "1mg", "pharmeasy"]],
  ["Rent", ["rent"]],
  ["EMI / Loans", ["emi", "loan"]],
  ["Salary", ["salary", "payroll"]],
  ["Interest", ["interest", "int.pd", "int pd"]],
  ["Refund", ["refund", "reversal", "cashback"]],
];
const DEFAULT_METHODS = ["UPI", "Cash", "Debit card", "Credit card", "Bank transfer", "Wallet"];
const DEFAULT_PEOPLE = [
  { id: "yadunath", name: "Yadunath" },
  { id: "radhika", name: "Radhika" },
];

function defaultData() {
  const categories = DEFAULT_CATEGORIES.map(([type, name, icon], i) => ({
    id: uid(),
    type,
    name,
    icon,
    color: COLORS[i % COLORS.length],
  }));
  const idOf = (name) => categories.find((c) => c.name === name)?.id;
  const rules = DEFAULT_RULES.flatMap(([catName, words]) =>
    words.map((keyword) => ({ id: uid(), keyword, categoryId: idOf(catName) }))
  ).filter((r) => r.categoryId);
  return {
    version: 1,
    settings: {
      theme: "system",
      reminderOn: false,
      reminderTime: "21:00",
      lastNotified: "",
      methods: [...DEFAULT_METHODS],
    },
    categories,
    transactions: [],
    budgets: {},
    recurring: [],
    goals: [],
    rules,
    people: DEFAULT_PEOPLE.map((p) => ({ ...p })),
  };
}

// Fill in anything missing (older backups, partial data)
function normalize(data) {
  const base = defaultData();
  return {
    version: 1,
    settings: { ...base.settings, ...(data.settings || {}) },
    categories: Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    budgets: data.budgets && typeof data.budgets === "object" ? data.budgets : {},
    recurring: Array.isArray(data.recurring) ? data.recurring : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
    rules: Array.isArray(data.rules) ? data.rules : base.rules,
    people: Array.isArray(data.people) && data.people.length ? data.people : base.people,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error("Could not read saved data", err);
  }
  return defaultData();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    toast("Could not save. Phone storage may be full.");
  }
  queueChanges();
  schedulePush();
}

let db = load();

const ui = {
  view: "home",
  month: monthOf(todayISO()),
  filters: null,
  showFilters: false,
  person: "all", // "all" or a person id: whose entries Home, Entries and Reports show
};

// ---------- Lookups and maths ----------
const FALLBACK_CAT = { id: "", name: "Unknown", icon: "❓", color: "#94a3b8", type: "expense" };
const cat = (id) => db.categories.find((c) => c.id === id) || FALLBACK_CAT;
const catsOfType = (type) => db.categories.filter((c) => c.type === type);
// Entries made before family sync have no person, so they belong to this phone's owner
const personOf = (t) => t.person || me();
const personName = (id) => db.people.find((p) => p.id === id)?.name || id;
const visibleTx = () => (ui.person === "all" ? db.transactions : db.transactions.filter((t) => personOf(t) === ui.person));
const txInMonth = (mk, list = visibleTx()) => list.filter((t) => t.date.startsWith(mk));
// Show names and the Both/Me/Her switch once more than one person is using the book
const shared = () => connected() || db.transactions.some((t) => personOf(t) !== me());
const sortTx = (list) =>
  [...list].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));

function totals(list) {
  const inc = sum(list.filter((t) => t.type === "income"), (t) => t.amount);
  const exp = sum(list.filter((t) => t.type === "expense"), (t) => t.amount);
  return { inc, exp, bal: round2(inc - exp) };
}

function byCategory(list, type) {
  const map = new Map();
  for (const t of list) {
    if (t.type !== type) continue;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  }
  return [...map.entries()]
    .map(([id, amount]) => ({ cat: cat(id), amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

function fallbackCategory(type, excludeId) {
  const name = type === "income" ? "Other income" : "Other";
  return (
    db.categories.find((c) => c.type === type && c.name === name && c.id !== excludeId) ||
    db.categories.find((c) => c.type === type && c.id !== excludeId)
  );
}

// ---------- Recurring entries ----------
// Adds any monthly entries that are due (also catches up missed months).
// The id is fixed per entry and month, so two phones adding the same rent never make a duplicate.
function generateRecurring() {
  const today = todayISO();
  const current = monthOf(today);
  const have = new Set(db.transactions.map((t) => t.id));
  let added = 0;
  let moved = false;
  for (const r of db.recurring) {
    let m = r.lastGenerated ? addMonths(r.lastGenerated, 1) : r.startMonth;
    let guard = 0;
    while (m <= current && guard++ < 240) {
      const date = `${m}-${pad(Math.min(r.day, daysIn(m)))}`;
      if (date > today) break;
      const id = `rec-${r.id}-${m}`;
      r.lastGenerated = m;
      m = addMonths(m, 1);
      if (have.has(id) || sync.deleted.includes(id)) continue;
      db.transactions.push({
        id,
        person: r.person || me(),
        type: cat(r.categoryId).type,
        amount: r.amount,
        date,
        categoryId: r.categoryId,
        method: r.method,
        note: r.note,
        recurringId: r.id,
        createdAt: Date.now(),
      });
      have.add(id);
      added++;
    }
    if (guard) moved = true;
  }
  if (added || moved) save();
  return added;
}

// ---------- Charts (plain SVG, no internet needed) ----------
function donut(items, total, label) {
  const r = 42;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const segs = items
    .map((it) => {
      const len = total ? (it.amount / total) * C : 0;
      const s = `<circle r="${r}" cx="50" cy="50" fill="none" style="stroke:${it.color}" stroke-width="14"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"/>`;
      offset += len;
      return s;
    })
    .join("");
  return `<svg width="124" height="124" viewBox="0 0 100 100" role="img" aria-label="${esc(label)} by category">
    <circle r="${r}" cx="50" cy="50" fill="none" style="stroke:var(--line)" stroke-width="14"/>
    ${segs}
    <text x="50" y="46" text-anchor="middle" style="fill:var(--muted);font-size:8px">${esc(label)}</text>
    <text x="50" y="59" text-anchor="middle" style="fill:var(--text);font-size:11px;font-weight:700">${esc(compact(total))}</text>
  </svg>`;
}

// Top 5 categories, the rest grouped as "Everything else"
function groupTop(items, n = 5) {
  if (items.length <= n + 1) return items.map((x) => ({ ...x, color: x.cat.color, name: `${x.cat.icon} ${x.cat.name}` }));
  const top = items.slice(0, n).map((x) => ({ ...x, color: x.cat.color, name: `${x.cat.icon} ${x.cat.name}` }));
  const rest = sum(items.slice(n), (x) => x.amount);
  return [...top, { amount: rest, color: "#94a3b8", name: "Everything else" }];
}

function categoryChart(items, label) {
  const total = sum(items, (x) => x.amount);
  if (!total) return `<div class="empty">Nothing here yet.</div>`;
  const groups = groupTop(items);
  return `<div class="donut-wrap">
    ${donut(groups, total, label)}
    <ul class="legend">
      ${groups
        .map(
          (g) => `<li><span class="dot" style="background:${g.color}"></span>
          <span class="name">${esc(g.name)}</span>
          <span>${Math.round((g.amount / total) * 100)}%</span></li>`
        )
        .join("")}
    </ul>
  </div>`;
}

function yearBars(months) {
  const W = 360;
  const H = 170;
  const top = 14;
  const bottom = 20;
  const max = Math.max(1, ...months.flatMap((m) => [m.inc, m.exp]));
  const gw = (W - 8) / 12;
  const bw = gw * 0.34;
  const scale = (v) => (v / max) * (H - top - bottom);
  const bars = months
    .map((m, i) => {
      const x = 4 + i * gw + gw * 0.13;
      const hi = scale(m.inc);
      const he = scale(m.exp);
      return `<rect x="${x}" y="${H - bottom - hi}" width="${bw}" height="${hi}" rx="2" style="fill:var(--income)"><title>${esc(m.label)} income ${esc(money(m.inc))}</title></rect>
        <rect x="${x + bw + 2}" y="${H - bottom - he}" width="${bw}" height="${he}" rx="2" style="fill:var(--expense)"><title>${esc(m.label)} spent ${esc(money(m.exp))}</title></rect>
        <text x="${4 + i * gw + gw / 2}" y="${H - 6}" text-anchor="middle">${esc(m.label[0])}</text>`;
    })
    .join("");
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending by month">
    <line x1="0" x2="${W}" y1="${top}" y2="${top}" style="stroke:var(--line)" stroke-dasharray="3 3"/>
    <text x="2" y="${top - 4}">${esc(compact(max))}</text>
    <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" style="stroke:var(--line)"/>
    ${bars}
  </svg>
  <div class="chart-key"><span class="income">Income</span><span class="expense">Spent</span></div>`;
}

function progressBar(value, total) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const cls = pct > 100 ? "over" : pct >= 80 ? "warn" : "";
  return `<div class="bar ${cls}"><span style="width:${Math.min(100, pct)}%"></span></div>`;
}

// ---------- Shared bits of UI ----------
function txRow(t) {
  const c = cat(t.categoryId);
  const sign = t.type === "income" ? "+" : "-";
  const who = shared() && ui.person === "all" ? personName(personOf(t)) : "";
  const sub = [who, c.name, t.method, dateLabel(t.date)].filter(Boolean).join(" · ");
  return `<li class="tx" data-action="edit-tx" data-id="${esc(t.id)}">
    <span class="tx-ico" style="background:${c.color}22">${esc(c.icon)}</span>
    <span class="tx-main">
      <span class="tx-title" style="display:block">${esc(t.note || c.name)}${t.recurringId ? " 🔁" : ""}</span>
      <span class="tx-sub" style="display:block">${esc(sub)}</span>
    </span>
    <span class="tx-amt ${t.type}">${sign}${esc(money(t.amount))}</span>
  </li>`;
}

function categoryOptions(selectedId, { all = false, type = null } = {}) {
  const groups = (type ? [type] : ["expense", "income"])
    .map(
      (ty) => `<optgroup label="${ty === "expense" ? "Expense" : "Income"}">
      ${catsOfType(ty)
        .map((c) => `<option value="${esc(c.id)}" ${c.id === selectedId ? "selected" : ""}>${esc(c.icon)} ${esc(c.name)}</option>`)
        .join("")}
    </optgroup>`
    )
    .join("");
  return (all ? `<option value="all">All categories</option>` : "") + groups;
}

function methodOptions(selected, { all = false } = {}) {
  const list = [...db.settings.methods];
  if (selected && selected !== "all" && !list.includes(selected)) list.push(selected);
  return (
    (all ? `<option value="all">All methods</option>` : "") +
    list.map((m) => `<option value="${esc(m)}" ${m === selected ? "selected" : ""}>${esc(m)}</option>`).join("")
  );
}

function toast(msg) {
  const el = $("#toast");
  // Inside an open pop-up the message must live in the pop-up, or it's hidden behind it
  const host = sheet.open ? sheet : document.body;
  if (el.parentNode !== host) host.appendChild(el);
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2600);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Views ----------
const TITLES = { home: "Money Book", list: "Entries", budgets: "Budgets", reports: "Reports", more: "More" };

function render() {
  $("#view-title").textContent = TITLES[ui.view];
  $("#month-switch").hidden = ui.view === "more";
  $("#fab").hidden = ui.view === "more";
  // Both / Yadunath / Radhika switch (budgets are always for the whole family)
  const bar = $("#person-bar");
  bar.hidden = !shared() || ui.view === "more" || ui.view === "budgets";
  if (!bar.hidden) {
    bar.innerHTML = [{ id: "all", name: "Both" }, ...db.people]
      .map(
        (p) =>
          `<button class="chip ${ui.person === p.id ? "on" : ""}" data-action="set-person" data-person="${esc(p.id)}">${esc(p.name)}${p.id === me() ? " (me)" : ""}</button>`
      )
      .join("");
  }
  updateSyncStatus();
  $("#month-label").textContent = ui.view === "reports" ? ui.month.slice(0, 4) : monthLabel(ui.month);
  for (const v of Object.keys(TITLES)) $(`#view-${v}`).hidden = v !== ui.view;
  $$(".bottom-nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === ui.view));
  ({ home: renderHome, list: renderList, budgets: renderBudgets, reports: renderReports, more: renderMore })[ui.view]();
  checkReminder();
}

// ----- Home -----
function renderHome() {
  const list = txInMonth(ui.month);
  const t = totals(list);
  const rate = t.inc > 0 ? Math.round((t.bal / t.inc) * 100) : null;
  // Only count spending in categories that have a budget, so rent etc. doesn't show as "over budget"
  // Budgets are for the whole family, so they count everyone's spending
  const budgeted = catsOfType("expense").filter((c) => Number(db.budgets[c.id]) > 0);
  const budgetTotal = sum(budgeted, (c) => Number(db.budgets[c.id]));
  const familyList = txInMonth(ui.month, db.transactions);
  const budgetSpent = sum(familyList.filter((x) => x.type === "expense" && db.budgets[x.categoryId] > 0), (x) => x.amount);
  // Who spent what (only on "Both")
  const perPerson =
    shared() && ui.person === "all"
      ? db.people.map((p) => ({ p, t: totals(familyList.filter((x) => personOf(x) === p.id)) }))
      : [];

  // Month vs last month
  const prevMk = addMonths(ui.month, -1);
  const prevList = txInMonth(prevMk);
  const prevT = totals(prevList);
  let compare;
  if (!prevList.length) {
    compare = `<div class="empty">No entries in ${esc(monthLabel(prevMk))} to compare with.</div>`;
  } else if (!list.length) {
    compare = `<div class="empty">Add entries for ${esc(monthLabel(ui.month))} to see how it compares.</div>`;
  } else {
    const nowBy = new Map(byCategory(list, "expense").map((x) => [x.cat.id, x.amount]));
    const prevBy = new Map(byCategory(prevList, "expense").map((x) => [x.cat.id, x.amount]));
    const ids = new Set([...nowBy.keys(), ...prevBy.keys()]);
    const changes = [...ids]
      .map((id) => ({ c: cat(id), now: nowBy.get(id) || 0, prev: prevBy.get(id) || 0 }))
      .map((x) => ({ ...x, diff: round2(x.now - x.prev) }))
      .filter((x) => x.diff !== 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5);
    compare = `
      ${changeLine("Total spent", t.exp, prevT.exp)}
      ${changeLine("Total income", t.inc, prevT.inc, true)}
      ${changes.length ? `<div class="small muted" style="margin:12px 0 4px">Biggest changes</div>` : ""}
      ${changes.map((x) => changeLine(`${x.c.icon} ${x.c.name}`, x.now, x.prev)).join("")}`;
  }

  const recent = sortTx(list).slice(0, 5);

  $("#view-home").innerHTML = `
    <div class="card">
      <div class="summary">
        <div><div class="label">Income</div><div class="value income">${esc(moneyR(t.inc))}</div></div>
        <div><div class="label">Spent</div><div class="value expense">${esc(moneyR(t.exp))}</div></div>
        <div><div class="label">Left</div><div class="value ${t.bal < 0 ? "expense" : ""}">${esc(moneyR(t.bal))}</div></div>
      </div>
      ${rate !== null ? `<div class="small muted" style="margin-top:8px">${esc(saverLabel())} saved ${rate}% of the income this month.</div>` : ""}
    </div>

    ${
      perPerson.length
        ? `<div class="card"><h2>Who spent what</h2>
        ${perPerson
          .map(
            ({ p, t: pt }) => `<div class="row"><span>${esc(p.name)}</span>
            <span class="small"><span class="income">+${esc(moneyR(pt.inc))}</span> · <span class="expense">-${esc(moneyR(pt.exp))}</span></span></div>`
          )
          .join("")}
      </div>`
        : ""
    }

    ${
      budgetTotal > 0
        ? `<div class="card" data-action="nav" data-view="budgets" style="cursor:pointer">
            <div class="row"><strong>Budgets</strong><span class="small muted">${esc(money(budgetSpent))} of ${esc(money(budgetTotal))}</span></div>
            ${progressBar(budgetSpent, budgetTotal)}
            <div class="small ${budgetSpent > budgetTotal ? "expense" : "muted"}" style="margin-top:6px">
              ${budgetSpent > budgetTotal ? `${esc(money(budgetSpent - budgetTotal))} over budget` : `${esc(money(budgetTotal - budgetSpent))} left to spend`}
              in ${budgeted.length} budgeted ${budgeted.length === 1 ? "category" : "categories"}
            </div>
          </div>`
        : ""
    }

    <div class="card">
      <h2>Where your money went</h2>
      ${categoryChart(byCategory(list, "expense"), "Spent")}
    </div>

    <div class="card">
      <h2>Compared with ${esc(monthLabel(prevMk))}</h2>
      ${compare}
    </div>

    <div class="card">
      <div class="card-head"><h2>Recent entries</h2>${list.length > 5 ? `<button class="link-btn" data-action="nav" data-view="list">See all</button>` : ""}</div>
      ${
        recent.length
          ? `<ul class="tx-list">${recent.map(txRow).join("")}</ul>`
          : `<div class="empty">No entries for ${esc(monthLabel(ui.month))}. Tap + to add one.</div>`
      }
    </div>`;
}

function saverLabel() {
  if (ui.person === "all") return shared() ? "Together you" : "You";
  return ui.person === me() ? "You" : personName(ui.person);
}

// For spending, going up is bad (red). For income, going up is good (green).
function changeLine(label, now, prev, upIsGood = false) {
  let note;
  if (!prev && !now) note = `<span class="muted">-</span>`;
  else if (!prev) note = `<span class="${upIsGood ? "change-down" : "change-up"}">new</span>`;
  else {
    const pct = Math.round(((now - prev) / prev) * 100);
    const up = pct > 0;
    const good = up === upIsGood;
    note = pct === 0 ? `<span class="muted">same</span>` : `<span class="${good ? "change-down" : "change-up"}">${up ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
  }
  return `<div class="row"><span>${esc(label)}</span><span class="small">${esc(money(now))} ${note}</span></div>`;
}

// ----- Entries list (search + filters) -----
function resetFilters() {
  ui.filters = {
    q: "",
    type: "all",
    categoryId: "all",
    method: "all",
    from: `${ui.month}-01`,
    to: `${ui.month}-${pad(daysIn(ui.month))}`,
    min: "",
    max: "",
  };
}

function applyFilters(f) {
  const q = f.q.trim().toLowerCase();
  const min = parseFloat(f.min);
  const max = parseFloat(f.max);
  return sortTx(
    visibleTx().filter((t) => {
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.type !== "all" && t.type !== f.type) return false;
      if (f.categoryId !== "all" && t.categoryId !== f.categoryId) return false;
      if (f.method !== "all" && t.method !== f.method) return false;
      if (!isNaN(min) && t.amount < min) return false;
      if (!isNaN(max) && t.amount > max) return false;
      if (q) {
        const hay = `${t.note || ""} ${cat(t.categoryId).name} ${t.method || ""} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
  );
}

function renderList() {
  if (!ui.filters) resetFilters();
  const f = ui.filters;
  $("#view-list").innerHTML = `
    <div class="card">
      <input class="input" type="search" placeholder="Search notes, categories, amounts" data-filter="q" value="${esc(f.q)}" />
      <div class="row" style="margin-top:8px">
        <button class="link-btn" data-action="toggle-filters">${ui.showFilters ? "Hide filters" : "More filters"}</button>
        <button class="link-btn" data-action="reset-filters">Reset</button>
      </div>
      ${
        ui.showFilters
          ? `<div class="filters">
          <div class="two">
            <label class="field" style="margin:0"><span>From</span><input type="date" data-filter="from" value="${esc(f.from)}"></label>
            <label class="field" style="margin:0"><span>To</span><input type="date" data-filter="to" value="${esc(f.to)}"></label>
          </div>
          <div class="two">
            <label class="field" style="margin:0"><span>Type</span>
              <select data-filter="type">
                <option value="all">Income and expense</option>
                <option value="expense" ${f.type === "expense" ? "selected" : ""}>Expense only</option>
                <option value="income" ${f.type === "income" ? "selected" : ""}>Income only</option>
              </select></label>
            <label class="field" style="margin:0"><span>Payment method</span><select data-filter="method">${methodOptions(f.method, { all: true })}</select></label>
          </div>
          <label class="field" style="margin:0"><span>Category</span><select data-filter="categoryId">${categoryOptions(f.categoryId, { all: true })}</select></label>
          <div class="two">
            <label class="field" style="margin:0"><span>Min amount</span><input type="number" inputmode="decimal" data-filter="min" value="${esc(f.min)}"></label>
            <label class="field" style="margin:0"><span>Max amount</span><input type="number" inputmode="decimal" data-filter="max" value="${esc(f.max)}"></label>
          </div>
        </div>`
          : ""
      }
    </div>
    <div id="list-results"></div>`;
  renderListResults();
}

function renderListResults() {
  const list = applyFilters(ui.filters);
  const t = totals(list);
  const groups = new Map();
  for (const tx of list) {
    if (!groups.has(tx.date)) groups.set(tx.date, []);
    groups.get(tx.date).push(tx);
  }
  $("#list-results").innerHTML = `
    <div class="card">
      <div class="row">
        <span class="small muted">${list.length} ${list.length === 1 ? "entry" : "entries"}</span>
        ${list.length ? `<button class="link-btn small" data-action="export-filtered">Export CSV</button>` : ""}
      </div>
      <div class="row small"><span class="income">In ${esc(money(t.inc))}</span><span class="expense">Out ${esc(money(t.exp))}</span></div>
      ${
        list.length
          ? [...groups.entries()]
              .map(([date, items]) => {
                const net = totals(items).bal;
                return `<div class="row day-head"><span>${esc(dayHeading(date))}</span><span>${net >= 0 ? "+" : ""}${esc(money(net))}</span></div>
              <ul class="tx-list">${items.map(txRow).join("")}</ul>`;
              })
              .join("")
          : `<div class="empty">No entries match.</div>`
      }
    </div>`;
}

// ----- Budgets -----
function renderBudgets() {
  const list = txInMonth(ui.month, db.transactions);
  const spent = new Map(byCategory(list, "expense").map((x) => [x.cat.id, x.amount]));
  const withBudget = catsOfType("expense").filter((c) => Number(db.budgets[c.id]) > 0);
  const noBudget = catsOfType("expense").filter((c) => !(Number(db.budgets[c.id]) > 0) && spent.get(c.id));
  const totalBudget = sum(withBudget, (c) => Number(db.budgets[c.id]));
  const totalSpent = sum(withBudget, (c) => spent.get(c.id) || 0);

  $("#view-budgets").innerHTML = `
    ${
      withBudget.length
        ? `<div class="card">
        <div class="row"><strong>${shared() ? "Family budgets (both of you)" : "All budgets"}</strong><span class="small muted">${esc(money(totalSpent))} of ${esc(money(totalBudget))}</span></div>
        ${progressBar(totalSpent, totalBudget)}
        <div class="small ${totalSpent > totalBudget ? "expense" : "muted"}" style="margin-top:6px">
          ${totalSpent > totalBudget ? `${esc(money(totalSpent - totalBudget))} over` : `${esc(money(totalBudget - totalSpent))} left`} for ${esc(monthLabel(ui.month))}
        </div>
      </div>
      <div class="card stack">
        ${withBudget
          .map((c) => {
            const b = Number(db.budgets[c.id]);
            const s = spent.get(c.id) || 0;
            return `<div>
              <div class="row"><span>${esc(c.icon)} ${esc(c.name)}</span><span class="small ${s > b ? "expense" : "muted"}">${esc(money(s))} / ${esc(money(b))}</span></div>
              ${progressBar(s, b)}
              ${s > b ? `<div class="small expense" style="margin-top:3px">Over by ${esc(money(s - b))}</div>` : ""}
            </div>`;
          })
          .join("")}
      </div>`
        : `<div class="card"><div class="empty">No budgets yet. Set a monthly limit for categories like Food or Shopping, and the bar turns red when you go over.</div></div>`
    }
    ${
      noBudget.length
        ? `<div class="card"><h2>Spending without a budget</h2>
        ${noBudget.map((c) => `<div class="row"><span>${esc(c.icon)} ${esc(c.name)}</span><span class="small">${esc(money(spent.get(c.id)))}</span></div>`).join("")}
      </div>`
        : ""
    }
    <button class="btn block" data-action="edit-budgets">Set monthly budgets</button>`;
}

// ----- Reports (year view + savings goals) -----
function renderReports() {
  const year = ui.month.slice(0, 4);
  const yearList = visibleTx().filter((t) => t.date.startsWith(year));
  const months = MONTHS.map((label, i) => {
    const t = totals(txInMonth(`${year}-${pad(i + 1)}`));
    return { label, inc: t.inc, exp: t.exp };
  });
  const yt = totals(yearList);
  const activeMonths = months.filter((m) => m.inc || m.exp).length;
  const topCats = byCategory(yearList, "expense").slice(0, 6);
  const topIncome = byCategory(yearList, "income").slice(0, 4);

  $("#view-reports").innerHTML = `
    <div class="card">
      <h2>${esc(year)} at a glance</h2>
      <div class="summary">
        <div><div class="label">Income</div><div class="value income">${esc(compact(yt.inc))}</div></div>
        <div><div class="label">Spent</div><div class="value expense">${esc(compact(yt.exp))}</div></div>
        <div><div class="label">Saved</div><div class="value">${esc(compact(yt.bal))}</div></div>
      </div>
      ${activeMonths ? `<div class="small muted" style="margin-top:8px">Average spend: ${esc(money(round2(yt.exp / activeMonths)))} per month (${activeMonths} months with entries)</div>` : ""}
    </div>

    <div class="card">
      <h2>Month by month</h2>
      ${yearList.length ? yearBars(months) : `<div class="empty">No entries in ${esc(year)} yet.</div>`}
    </div>

    ${
      topCats.length
        ? `<div class="card stack"><h2 style="margin-bottom:0">Top spending in ${esc(year)}</h2>
        ${topCats
          .map(
            (x) => `<div><div class="row"><span>${esc(x.cat.icon)} ${esc(x.cat.name)}</span><span class="small">${esc(money(x.amount))}</span></div>
            <div class="bar"><span style="width:${(x.amount / topCats[0].amount) * 100}%;background:${x.cat.color}"></span></div></div>`
          )
          .join("")}
      </div>`
        : ""
    }

    ${
      topIncome.length
        ? `<div class="card"><h2>Income sources in ${esc(year)}</h2>
        ${topIncome.map((x) => `<div class="row"><span>${esc(x.cat.icon)} ${esc(x.cat.name)}</span><span class="small income">${esc(money(x.amount))}</span></div>`).join("")}
      </div>`
        : ""
    }

    <div class="card">
      <div class="card-head"><h2>Savings goals</h2><button class="link-btn" data-action="new-goal">+ Add goal</button></div>
      ${db.goals.length ? `<div class="stack">${db.goals.map(goalBlock).join("")}</div>` : `<div class="empty">Save towards something, like "Goa trip ₹50,000 by March".</div>`}
    </div>`;
}

function goalBlock(g) {
  const left = round2(g.target - g.saved);
  let plan = "";
  if (left <= 0) plan = `<span class="income">Goal reached 🎉</span>`;
  else if (g.deadline) {
    const now = monthOf(todayISO());
    const [ny, nm] = now.split("-").map(Number);
    const [dy, dm] = g.deadline.split("-").map(Number);
    const monthsLeft = (dy - ny) * 12 + (dm - nm) + 1;
    plan =
      monthsLeft > 0
        ? `Save ${esc(money(Math.ceil(left / monthsLeft)))}/month to reach it by ${esc(monthLabel(g.deadline))}`
        : `<span class="expense">Deadline passed, ${esc(money(left))} to go</span>`;
  } else plan = `${esc(money(left))} to go`;
  return `<div>
    <div class="row"><button class="link-btn" style="color:var(--text)" data-action="edit-goal" data-id="${esc(g.id)}">🎯 ${esc(g.name)}</button>
      <span class="small muted">${esc(money(g.saved))} / ${esc(money(g.target))}</span></div>
    ${progressBar(Math.min(g.saved, g.target), g.target).replace('class="bar ', 'class="bar goal ')}
    <div class="row small" style="margin-top:4px"><span class="muted">${plan}</span>
      <button class="link-btn small" data-action="goal-money" data-id="${esc(g.id)}">Add money</button></div>
  </div>`;
}

// ----- More (settings) -----
function renderMore() {
  const used = Math.round(((localStorage.getItem(STORAGE_KEY) || "").length * 2) / 1024);
  const familyCard = connected()
    ? `<div class="card"><h2>Family sync</h2><ul class="menu">
      <li class="clickable" data-action="pick-me-again"><span>📱 This phone belongs to</span><span class="muted">${esc(personName(me()))} ›</span></li>
      <li class="clickable" data-action="open-people"><span>👥 Names</span><span class="muted">${esc(db.people.map((p) => p.name).join(", "))} ›</span></li>
      <li class="clickable" data-action="sync-now"><span>🔄 Sync now</span><span class="muted">›</span></li>
      <li class="clickable" data-action="sign-out"><span class="expense">🚪 Sign out this phone</span><span class="muted">›</span></li>
    </ul><div class="small muted" id="sync-status" style="margin-top:8px">${esc(syncStatusText())}</div></div>`
    : `<div class="card"><h2>Family sync</h2>
      <p class="small muted" style="margin-top:0">Connect to your family book so Yadunath and Radhika see each other's entries on both phones.</p>
      <button class="btn block" data-action="open-connect">Connect family book</button></div>`;
  $("#view-more").innerHTML = `
    ${familyCard}
    <div class="card"><h2>Setup</h2><ul class="menu">
      <li class="clickable" data-action="open-categories"><span>🗂️ Categories</span><span class="muted">${db.categories.length} ›</span></li>
      <li class="clickable" data-action="open-recurring"><span>🔁 Repeating entries (rent, salary, EMIs)</span><span class="muted">${db.recurring.length} ›</span></li>
      <li class="clickable" data-action="open-methods"><span>💳 Payment methods</span><span class="muted">${db.settings.methods.length} ›</span></li>
      <li class="clickable" data-action="edit-budgets"><span>📊 Monthly budgets</span><span class="muted">›</span></li>
    </ul></div>

    <div class="card"><h2>Bank statements</h2><ul class="menu">
      <li class="clickable" data-action="open-import"><span>📥 Import bank statement (CSV)</span><span class="muted">›</span></li>
      <li class="clickable" data-action="open-rules"><span>🏷️ Auto-category keywords</span><span class="muted">${db.rules.length} ›</span></li>
    </ul></div>

    <div class="card"><h2>Your data</h2><ul class="menu">
      <li class="clickable" data-action="export-all"><span>📤 Export all entries (CSV for Excel)</span><span class="muted">›</span></li>
      <li class="clickable" data-action="backup"><span>💾 Save backup file</span><span class="muted">›</span></li>
      <li class="clickable" data-action="restore"><span>♻️ Restore from backup</span><span class="muted">›</span></li>
      ${connected() ? "" : `<li class="clickable" data-action="clear-all"><span class="expense">🗑️ Delete all data</span><span class="muted">›</span></li>`}
    </ul>
    <div class="small muted" style="margin-top:8px">${db.transactions.length} entries · about ${used} KB · ${
      connected()
        ? "saved on this phone and in your family book online."
        : "stored only on this device. Save a backup now and then, because clearing your browser data deletes it."
    }</div>
    </div>

    <div class="card"><h2>App</h2><ul class="menu">
      <li class="clickable" data-action="open-reminders"><span>⏰ Daily reminder</span><span class="muted">${db.settings.reminderOn ? esc(db.settings.reminderTime) : "Off"} ›</span></li>
      <li class="clickable" data-action="open-theme"><span>🌓 Theme</span><span class="muted">${esc({ system: "Auto", light: "Light", dark: "Dark" }[db.settings.theme])} ›</span></li>
    </ul></div>
    <input type="file" id="restore-file" accept=".json,application/json" hidden />`;
}

// ---------- Bottom sheet (pop-up forms) ----------
const sheet = $("#sheet");
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  if (!sheet.open) {
    sheet.showModal();
    // Lets the phone's Back button close the sheet instead of leaving the app
    history.pushState({ sheet: true }, "");
  }
  sheet.scrollTop = 0;
}
function closeSheet() {
  if (sheet.open) sheet.close();
}
sheet.addEventListener("close", () => {
  if (history.state && history.state.sheet) history.back();
});
window.addEventListener("popstate", () => {
  if (sheet.open) sheet.close();
});
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet();
});

// ----- Add / edit entry -----
let txDraft = null;

// Someone else's entry: show it, but only its owner can change it
function openTxView(t) {
  const c = cat(t.categoryId);
  const owner = personName(personOf(t));
  openSheet(`<h2>${esc(t.note || c.name)}</h2>
    <div class="card" style="margin-bottom:12px">
      <div class="row"><span class="muted">Amount</span><strong class="${t.type}">${t.type === "income" ? "+" : "-"}${esc(money(t.amount))}</strong></div>
      <div class="row"><span class="muted">Category</span><span>${esc(c.icon)} ${esc(c.name)}</span></div>
      <div class="row"><span class="muted">Date</span><span>${esc(dateLabel(t.date))}</span></div>
      ${t.method ? `<div class="row"><span class="muted">Payment method</span><span>${esc(t.method)}</span></div>` : ""}
      <div class="row"><span class="muted">Added by</span><span>${esc(owner)}</span></div>
    </div>
    <p class="small muted">Only ${esc(owner)} can edit or delete this entry, from their phone.</p>
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Close</button></div>`);
}

function openTxForm(id) {
  const t = id ? db.transactions.find((x) => x.id === id) : null;
  if (t && personOf(t) !== me()) return openTxView(t);
  const today = todayISO();
  txDraft = t
    ? { ...t }
    : {
        id: null,
        type: "expense",
        amount: "",
        date: monthOf(today) === ui.month ? today : `${ui.month}-01`,
        categoryId: null,
        method: db.settings.methods[0] || "",
        note: "",
      };
  openSheet(`
    <h2>${t ? "Edit entry" : "Add entry"}</h2>
    <form data-form="tx" autocomplete="off">
      <div class="seg" id="tx-seg">${segButtons()}</div>
      <label class="field"><span>Amount (₹)</span>
        <input name="amount" class="amount-input" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${esc(txDraft.amount)}" placeholder="0"></label>
      <div class="field"><span>Category</span><div class="chips" id="cat-chips">${catChips()}</div></div>
      <div class="two">
        <label class="field"><span>Date</span><input type="date" name="date" required value="${esc(txDraft.date)}"></label>
        <label class="field"><span>Payment method</span><select name="method">${methodOptions(txDraft.method)}</select></label>
      </div>
      <label class="field"><span>Note (optional)</span><input name="note" maxlength="120" placeholder="e.g. Dinner with friends" value="${esc(txDraft.note)}"></label>
      ${t ? "" : `<label class="check"><input type="checkbox" name="repeat"> Repeat every month on this date</label>`}
      <div class="actions">
        ${t ? `<button type="button" class="btn danger" data-action="delete-tx">Delete</button>` : `<button type="button" class="btn secondary" data-action="close-sheet">Cancel</button>`}
        <button type="submit" class="btn">Save</button>
      </div>
      ${t && t.recurringId ? `<div class="small muted" style="margin-top:10px">🔁 Added automatically from a repeating entry.</div>` : ""}
    </form>`);
  if (!t) setTimeout(() => $("[name=amount]", sheet)?.focus(), 50);
}

function segButtons() {
  return ["expense", "income"]
    .map(
      (ty) =>
        `<button type="button" data-action="tx-type" data-type="${ty}" class="${txDraft.type === ty ? `on-${ty}` : ""}">${ty === "expense" ? "Expense" : "Income"}</button>`
    )
    .join("");
}

function catChips() {
  return catsOfType(txDraft.type)
    .map(
      (c) =>
        `<button type="button" class="chip ${txDraft.categoryId === c.id ? "on" : ""}" data-action="pick-cat" data-id="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`
    )
    .join("");
}

function saveTx(form) {
  const fd = new FormData(form);
  const amount = round2(parseFloat(fd.get("amount")));
  if (!(amount > 0)) return toast("Enter an amount above zero.");
  if (!txDraft.categoryId) {
    const chips = $("#cat-chips");
    chips.classList.add("need");
    chips.scrollIntoView({ behavior: "smooth", block: "center" });
    return toast("Pick a category first.");
  }
  const entry = {
    person: txDraft.person || me(),
    type: txDraft.type,
    amount,
    date: fd.get("date"),
    categoryId: txDraft.categoryId,
    method: fd.get("method") || "",
    note: (fd.get("note") || "").trim(),
  };
  if (txDraft.id) {
    Object.assign(db.transactions.find((x) => x.id === txDraft.id), entry);
  } else {
    const tx = { id: uid(), createdAt: Date.now(), ...entry };
    if (fd.get("repeat")) {
      const r = {
        id: uid(),
        person: entry.person,
        amount,
        categoryId: entry.categoryId,
        method: entry.method,
        note: entry.note,
        day: Number(entry.date.slice(8, 10)),
        startMonth: monthOf(entry.date),
        lastGenerated: monthOf(entry.date),
      };
      db.recurring.push(r);
      tx.recurringId = r.id;
    }
    db.transactions.push(tx);
  }
  save();
  closeSheet();
  render();
  toast("Saved");
}

// ----- Categories -----
function openCategories() {
  const section = (type) => `
    <div class="small muted" style="margin:10px 0 2px;font-weight:600">${type === "expense" ? "EXPENSE" : "INCOME"}</div>
    <ul class="menu">${catsOfType(type)
      .map(
        (c) => `<li class="clickable" data-action="edit-cat" data-id="${esc(c.id)}">
          <span><span class="tx-ico" style="display:inline-grid;width:28px;height:28px;font-size:15px;margin-right:8px;background:${c.color}22">${esc(c.icon)}</span>${esc(c.name)}</span>
          <span class="muted">›</span></li>`
      )
      .join("")}</ul>`;
  openSheet(`<h2>Categories</h2>
    ${section("expense")}${section("income")}
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Done</button><button class="btn" data-action="new-cat">+ Add category</button></div>`);
}

function openCategoryForm(id) {
  const c = id ? db.categories.find((x) => x.id === id) : { type: "expense", name: "", icon: "🏷️", color: COLORS[db.categories.length % COLORS.length] };
  openSheet(`<h2>${id ? "Edit category" : "New category"}</h2>
    <form data-form="cat" data-id="${esc(id || "")}" autocomplete="off">
      ${
        id
          ? ""
          : `<label class="field"><span>Type</span><select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label>`
      }
      <label class="field"><span>Name</span><input name="name" required maxlength="30" value="${esc(c.name)}"></label>
      <div class="two">
        <label class="field"><span>Emoji</span><input name="icon" maxlength="4" value="${esc(c.icon)}"></label>
        <label class="field"><span>Colour</span><input name="color" type="color" value="${esc(c.color)}" style="height:46px;padding:4px"></label>
      </div>
      <div class="actions">
        ${id ? `<button type="button" class="btn danger" data-action="delete-cat" data-id="${esc(id)}">Delete</button>` : ""}
        <button type="button" class="btn secondary" data-action="open-categories">Back</button>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`);
}

function saveCategory(form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const name = fd.get("name").trim();
  if (!name) return toast("Enter a name.");
  const fields = { name, icon: fd.get("icon").trim() || "🏷️", color: fd.get("color") };
  if (id) Object.assign(db.categories.find((c) => c.id === id), fields);
  else db.categories.push({ id: uid(), type: fd.get("type"), ...fields });
  save();
  render();
  openCategories();
}

function deleteCategory(id) {
  const c = db.categories.find((x) => x.id === id);
  const usedTx = db.transactions.filter((t) => t.categoryId === id).length;
  const usedRec = db.recurring.filter((r) => r.categoryId === id).length;
  const fallback = fallbackCategory(c.type, id);
  if ((usedTx || usedRec) && !fallback) return toast("You need at least one other category of this type first.");
  const msg =
    usedTx || usedRec
      ? `Delete "${c.name}"? Its ${usedTx} entries${usedRec ? ` and ${usedRec} repeating entries` : ""} will move to "${fallback.name}".`
      : `Delete "${c.name}"?`;
  if (!confirm(msg)) return;
  for (const t of db.transactions) if (t.categoryId === id) t.categoryId = fallback.id;
  for (const r of db.recurring) if (r.categoryId === id) r.categoryId = fallback.id;
  db.rules = db.rules.filter((r) => r.categoryId !== id);
  delete db.budgets[id];
  db.categories = db.categories.filter((x) => x.id !== id);
  save();
  render();
  openCategories();
}

// ----- Repeating entries -----
function openRecurring() {
  openSheet(`<h2>Repeating entries</h2>
    <p class="small muted" style="margin-top:-6px">Added automatically every month on the day you choose, for things like rent, salary, EMIs and subscriptions.</p>
    ${
      db.recurring.length
        ? `<ul class="menu">${db.recurring
            .map((r) => {
              const c = cat(r.categoryId);
              return `<li class="clickable" data-action="edit-rec" data-id="${esc(r.id)}">
              <span>${esc(c.icon)} ${esc(r.note || c.name)}<br><span class="small muted">${shared() ? `${esc(personName(r.person || me()))} · ` : ""}Every month on day ${r.day}${r.method ? ` · ${esc(r.method)}` : ""}</span></span>
              <span class="tx-amt ${c.type}">${esc(money(r.amount))}</span></li>`;
            })
            .join("")}</ul>`
        : `<div class="empty">None yet.</div>`
    }
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Done</button><button class="btn" data-action="new-rec">+ Add</button></div>`);
}

function openRecurringForm(id) {
  const r = id
    ? db.recurring.find((x) => x.id === id)
    : { amount: "", categoryId: catsOfType("expense")[0]?.id, method: db.settings.methods[0] || "", note: "", day: 1, startMonth: monthOf(todayISO()) };
  openSheet(`<h2>${id ? "Edit repeating entry" : "New repeating entry"}</h2>
    <form data-form="rec" data-id="${esc(id || "")}" autocomplete="off">
      <label class="field"><span>Amount (₹)</span><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${esc(r.amount)}"></label>
      <label class="field"><span>Category (decides income or expense)</span><select name="categoryId">${categoryOptions(r.categoryId)}</select></label>
      <label class="field"><span>Name / note</span><input name="note" maxlength="120" placeholder="e.g. House rent" value="${esc(r.note)}"></label>
      <div class="two">
        <label class="field"><span>Day of month</span><input name="day" type="number" min="1" max="31" required value="${esc(r.day)}"></label>
        <label class="field"><span>Payment method</span><select name="method">${methodOptions(r.method)}</select></label>
      </div>
      ${
        id
          ? `<div class="small muted" style="margin-bottom:12px">Changes apply to future months. Past entries stay as they are.</div>`
          : `<label class="field"><span>Start from month</span><input name="startMonth" type="month" required value="${esc(r.startMonth)}"></label>
             <div class="small muted" style="margin-bottom:12px">If you pick a past month, the missed months are filled in too.</div>`
      }
      <div class="actions">
        ${id ? `<button type="button" class="btn danger" data-action="delete-rec" data-id="${esc(id)}">Stop</button>` : ""}
        <button type="button" class="btn secondary" data-action="open-recurring">Back</button>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`);
}

function saveRecurring(form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const amount = round2(parseFloat(fd.get("amount")));
  const day = Math.min(31, Math.max(1, parseInt(fd.get("day"), 10) || 1));
  if (!(amount > 0)) return toast("Enter an amount above zero.");
  const fields = { amount, categoryId: fd.get("categoryId"), note: fd.get("note").trim(), day, method: fd.get("method") || "" };
  if (id) Object.assign(db.recurring.find((r) => r.id === id), fields);
  else db.recurring.push({ id: uid(), person: me(), ...fields, startMonth: fd.get("startMonth"), lastGenerated: null });
  const added = generateRecurring();
  save();
  render();
  openRecurring();
  toast(added ? `Saved. Added ${added} ${added === 1 ? "entry" : "entries"} that were due.` : "Saved");
}

// ----- Payment methods -----
function openMethods() {
  openSheet(`<h2>Payment methods</h2>
    <form data-form="methods">
      <label class="field"><span>One per line</span><textarea name="methods" rows="8">${esc(db.settings.methods.join("\n"))}</textarea></label>
      <div class="actions"><button type="button" class="btn secondary" data-action="close-sheet">Cancel</button><button type="submit" class="btn">Save</button></div>
    </form>`);
}

// ----- Budgets -----
function openBudgets() {
  openSheet(`<h2>Monthly budgets</h2>
    <p class="small muted" style="margin-top:-6px">The most you want to spend per month. Leave empty for no limit.</p>
    <form data-form="budgets">
      ${catsOfType("expense")
        .map(
          (c) => `<label class="field"><span>${esc(c.icon)} ${esc(c.name)}</span>
          <input name="${esc(c.id)}" type="number" inputmode="decimal" min="0" step="1" placeholder="No limit" value="${esc(db.budgets[c.id] || "")}"></label>`
        )
        .join("")}
      <div class="actions"><button type="button" class="btn secondary" data-action="close-sheet">Cancel</button><button type="submit" class="btn">Save</button></div>
    </form>`);
}

// ----- Savings goals -----
function openGoalForm(id) {
  const g = id ? db.goals.find((x) => x.id === id) : { name: "", target: "", saved: 0, deadline: "" };
  openSheet(`<h2>${id ? "Edit goal" : "New savings goal"}</h2>
    <form data-form="goal" data-id="${esc(id || "")}" autocomplete="off">
      <label class="field"><span>Goal</span><input name="name" required maxlength="40" placeholder="e.g. Goa trip" value="${esc(g.name)}"></label>
      <div class="two">
        <label class="field"><span>Target (₹)</span><input name="target" type="number" inputmode="decimal" min="1" required value="${esc(g.target)}"></label>
        <label class="field"><span>Saved so far (₹)</span><input name="saved" type="number" inputmode="decimal" min="0" value="${esc(g.saved)}"></label>
      </div>
      <label class="field"><span>Reach it by (optional)</span><input name="deadline" type="month" value="${esc(g.deadline)}"></label>
      <div class="actions">
        ${id ? `<button type="button" class="btn danger" data-action="delete-goal" data-id="${esc(id)}">Delete</button>` : `<button type="button" class="btn secondary" data-action="close-sheet">Cancel</button>`}
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`);
}

function openGoalMoney(id) {
  const g = db.goals.find((x) => x.id === id);
  openSheet(`<h2>🎯 ${esc(g.name)}</h2>
    <p class="small muted" style="margin-top:-6px">Saved ${esc(money(g.saved))} of ${esc(money(g.target))}</p>
    <form data-form="goal-money" data-id="${esc(id)}">
      <label class="field"><span>Amount (₹)</span><input name="amount" class="amount-input" type="number" inputmode="decimal" min="0.01" step="0.01" required></label>
      <div class="actions">
        <button type="submit" class="btn secondary" name="dir" value="out">Take out</button>
        <button type="submit" class="btn" name="dir" value="in">Add</button>
      </div>
    </form>`);
  setTimeout(() => $("[name=amount]", sheet)?.focus(), 50);
}

// ----- Auto-category keywords -----
function openRules() {
  const rows = [...db.rules].sort((a, b) => cat(a.categoryId).name.localeCompare(cat(b.categoryId).name));
  openSheet(`<h2>Auto-category keywords</h2>
    <p class="small muted" style="margin-top:-6px">When you import a bank statement, a line that contains the keyword goes into that category.</p>
    <form data-form="rule" class="two" style="grid-template-columns:1fr 1fr auto;align-items:end;margin-bottom:8px">
      <label class="field" style="margin:0"><span>Keyword</span><input name="keyword" required maxlength="40" placeholder="e.g. swiggy"></label>
      <label class="field" style="margin:0"><span>Category</span><select name="categoryId">${categoryOptions(null)}</select></label>
      <button class="btn small" type="submit" style="height:44px">Add</button>
    </form>
    <ul class="menu">${rows
      .map((r) => {
        const c = cat(r.categoryId);
        return `<li><span>"${esc(r.keyword)}" → ${esc(c.icon)} ${esc(c.name)}</span><button class="link-btn expense" data-action="delete-rule" data-id="${esc(r.id)}" aria-label="Remove">✕</button></li>`;
      })
      .join("")}</ul>
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Done</button></div>`);
}

// ----- Bank statement import -----
let imp = null;

function openImport() {
  imp = null;
  openSheet(`<h2>Import bank statement</h2>
    <p class="small muted" style="margin-top:-6px">Download your statement from net banking as <b>CSV</b>. If your bank only gives Excel (.xls/.xlsx), open it in Excel or Google Sheets and save it as CSV first. The file is read on this phone only.</p>
    <label class="field"><span>Choose CSV file</span><input type="file" id="import-file" accept=".csv,text/csv,text/plain"></label>
    <div id="import-step"></div>
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Cancel</button></div>`);
}

function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const sample = text.split("\n").slice(0, 10).join("\n");
  const delim = [",", ";", "\t", "|"]
    .map((d) => [d, sample.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((s) => s.trim())).filter((r) => r.some(Boolean));
}

function parseAmount(s) {
  if (s == null) return NaN;
  let str = String(s).trim();
  if (!str) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(str)) neg = true;
  if (/\bdr\.?$/i.test(str)) neg = true;
  str = str.replace(/(cr|dr)\.?$/i, "").replace(/[^0-9.\-]/g, "");
  if (str.startsWith("-")) neg = !neg;
  const n = parseFloat(str.replace(/-/g, ""));
  if (isNaN(n)) return NaN;
  return neg ? -n : n;
}

function parseDate(s, fmt) {
  if (!s) return null;
  const str = s.trim().split(/\s+\d{1,2}:\d{2}/)[0]; // drop any time part
  const parts = str.split(/[\/\-.\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  let y;
  let m;
  let d;
  const monthName = (p) => MONTHS.findIndex((x) => p.toLowerCase().startsWith(x.toLowerCase())) + 1;
  if (/^\d{4}$/.test(parts[0])) [y, m, d] = parts;
  else if (fmt === "mdy") [m, d, y] = parts;
  else [d, m, y] = parts;
  if (isNaN(Number(m))) m = monthName(m);
  if (isNaN(Number(d)) && monthName(d)) [d, m] = [m, monthName(d)]; // e.g. "Oct 30 2026"
  y = Number(y);
  m = Number(m);
  d = Number(d);
  if (y < 100) y += 2000;
  if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function autoCategory(desc, type) {
  const text = desc.toLowerCase();
  const rule = db.rules.find((r) => text.includes(r.keyword.toLowerCase()) && cat(r.categoryId).type === type);
  return rule ? rule.categoryId : fallbackCategory(type)?.id;
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result));
    if (rows.length < 2) return toast("Couldn't find any rows in that file.");
    let headerRow = rows.findIndex((r) => r.some((c) => /date/i.test(c)));
    if (headerRow < 0) headerRow = 0;
    imp = { rows, headerRow };
    guessColumns();
    renderImportMapping();
  };
  reader.readAsText(file);
}

function guessColumns() {
  const head = imp.rows[imp.headerRow].map((h) => h.toLowerCase());
  const find = (re) => head.findIndex((h) => re.test(h));
  imp.dateCol = Math.max(0, find(/date/));
  imp.descCol = find(/narration|description|particular|details|remark|merchant/);
  if (imp.descCol < 0) imp.descCol = Math.min(1, head.length - 1);
  imp.debitCol = find(/withdraw|debit|\bdr\b/);
  imp.creditCol = find(/deposit|credit|\bcr\b/);
  imp.amountCol = find(/amount/);
  if (imp.amountCol < 0) imp.amountCol = imp.debitCol >= 0 ? imp.debitCol : 0;
  imp.mode = imp.debitCol >= 0 && imp.creditCol >= 0 && imp.debitCol !== imp.creditCol ? "split" : "single";
  imp.sign = "minus-expense";
  imp.fmt = "dmy";
  imp.method = db.settings.methods.includes("Bank transfer") ? "Bank transfer" : db.settings.methods[0] || "";
}

function renderImportMapping() {
  const head = imp.rows[imp.headerRow];
  const colOpts = (sel) => head.map((h, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${esc(h || `Column ${i + 1}`)}</option>`).join("");
  $("#import-step").innerHTML = `
    <div class="card" style="margin-top:4px">
      <h2>Match the columns</h2>
      <label class="field"><span>Header is on row</span><input type="number" min="1" max="${imp.rows.length}" value="${imp.headerRow + 1}" data-imp="headerRow"></label>
      <div class="two">
        <label class="field"><span>Date column</span><select data-imp="dateCol">${colOpts(imp.dateCol)}</select></label>
        <label class="field"><span>Date format</span><select data-imp="fmt">
          <option value="dmy" ${imp.fmt === "dmy" ? "selected" : ""}>Day/Month/Year</option>
          <option value="mdy" ${imp.fmt === "mdy" ? "selected" : ""}>Month/Day/Year</option></select></label>
      </div>
      <label class="field"><span>Description column</span><select data-imp="descCol">${colOpts(imp.descCol)}</select></label>
      <label class="field"><span>How are amounts shown?</span><select data-imp="mode">
        <option value="split" ${imp.mode === "split" ? "selected" : ""}>Separate withdrawal and deposit columns</option>
        <option value="single" ${imp.mode === "single" ? "selected" : ""}>One amount column</option></select></label>
      ${
        imp.mode === "split"
          ? `<div class="two">
          <label class="field"><span>Withdrawal (spent)</span><select data-imp="debitCol">${colOpts(imp.debitCol)}</select></label>
          <label class="field"><span>Deposit (received)</span><select data-imp="creditCol">${colOpts(imp.creditCol)}</select></label></div>`
          : `<div class="two">
          <label class="field"><span>Amount column</span><select data-imp="amountCol">${colOpts(imp.amountCol)}</select></label>
          <label class="field"><span>Spending shows as</span><select data-imp="sign">
            <option value="minus-expense" ${imp.sign === "minus-expense" ? "selected" : ""}>Minus (-500)</option>
            <option value="plus-expense" ${imp.sign === "plus-expense" ? "selected" : ""}>Plus (credit card)</option></select></label></div>`
      }
      <label class="field"><span>Payment method for these entries</span><select data-imp="method">${methodOptions(imp.method)}</select></label>
      <button class="btn block" data-action="import-preview">Preview entries</button>
    </div>
    <div id="import-preview"></div>`;
}

function buildImportPreview() {
  const items = [];
  let skipped = 0;
  for (const r of imp.rows.slice(imp.headerRow + 1)) {
    const date = parseDate(r[imp.dateCol], imp.fmt);
    const desc = (r[imp.descCol] || "").replace(/\s+/g, " ").trim().slice(0, 120);
    let type;
    let amount;
    if (imp.mode === "split") {
      const d = Math.abs(parseAmount(r[imp.debitCol]));
      const c = Math.abs(parseAmount(r[imp.creditCol]));
      if (d > 0) [type, amount] = ["expense", d];
      else if (c > 0) [type, amount] = ["income", c];
    } else {
      const a = parseAmount(r[imp.amountCol]);
      if (a) {
        const isExpense = imp.sign === "minus-expense" ? a < 0 : a > 0;
        [type, amount] = [isExpense ? "expense" : "income", Math.abs(a)];
      }
    }
    if (!date || !type || !(amount > 0)) {
      skipped++;
      continue;
    }
    amount = round2(amount);
    const dup = db.transactions.some((t) => t.date === date && t.amount === amount && t.type === type && (t.note || "") === desc);
    items.push({ date, desc, type, amount, categoryId: autoCategory(desc, type), include: !dup, dup });
  }
  imp.items = items;
  imp.skipped = skipped;
  renderImportPreview();
}

function renderImportPreview() {
  const n = imp.items.filter((x) => x.include).length;
  const dups = imp.items.filter((x) => x.dup).length;
  $("#import-preview").innerHTML = `
    <div class="card">
      <h2>${imp.items.length} entries found</h2>
      <div class="small muted" style="margin-bottom:8px">
        ${imp.skipped ? `${imp.skipped} lines skipped (no date or amount, like totals). ` : ""}
        ${dups ? `${dups} look like entries you already have, so they're unticked. ` : ""}
        Check the categories, then import.
      </div>
      <div class="table-wrap"><table class="preview">
        <tr><th></th><th>Date</th><th>Details</th><th>Amount</th><th>Category</th></tr>
        ${imp.items
          .map(
            (x, i) => `<tr>
            <td><input type="checkbox" data-imp-inc="${i}" ${x.include ? "checked" : ""}></td>
            <td>${esc(dateLabel(x.date))}</td>
            <td title="${esc(x.desc)}">${esc(x.desc.slice(0, 28))}${x.dup ? ' <span class="muted">(dup?)</span>' : ""}</td>
            <td class="${x.type}">${x.type === "income" ? "+" : "-"}${esc(money(x.amount))}</td>
            <td><select data-imp-cat="${i}">${categoryOptions(x.categoryId, { type: x.type })}</select></td>
          </tr>`
          )
          .join("")}
      </table></div>
      <button class="btn block" style="margin-top:12px" data-action="import-commit" ${n ? "" : "disabled"}>Import ${n} ${n === 1 ? "entry" : "entries"}</button>
    </div>`;
}

function commitImport() {
  const chosen = imp.items.filter((x) => x.include);
  const now = Date.now();
  chosen.forEach((x, i) =>
    db.transactions.push({
      id: uid(),
      person: me(),
      type: x.type,
      amount: x.amount,
      date: x.date,
      categoryId: x.categoryId,
      method: imp.method,
      note: x.desc,
      imported: true,
      createdAt: now + i,
    })
  );
  save();
  closeSheet();
  render();
  toast(`Imported ${chosen.length} entries`);
}

// ----- CSV export, backup, restore -----
function exportCSV(list, name) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Date", "Person", "Type", "Category", "Amount", "Payment method", "Note"].join(",")];
  for (const t of sortTx(list).reverse()) {
    lines.push([t.date, personName(personOf(t)), t.type, cat(t.categoryId).name, t.amount, t.method, t.note].map(cell).join(","));
  }
  // The BOM at the start makes Excel read ₹ and other symbols correctly
  download(name, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

function backup() {
  download(`money-book-backup-${todayISO()}.json`, JSON.stringify(db, null, 1), "application/json");
  toast("Backup saved to your downloads");
}

function restoreFrom(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data.transactions) || !Array.isArray(data.categories)) throw new Error("bad file");
      if (connected()) {
        // Shared book: add the backup's missing entries instead of wiping both phones
        // The backup may come from a phone with different category ids: match them by name
        const known = (id) => db.categories.some((c) => c.id === id);
        const catFor = (t) => {
          if (known(t.categoryId)) return t.categoryId;
          const old = data.categories.find((c) => c.id === t.categoryId);
          const match = old && db.categories.find((c) => c.type === old.type && c.name.toLowerCase() === old.name.toLowerCase());
          return match ? match.id : fallbackCategory(t.type)?.id;
        };
        const byId = new Map(db.transactions.map((t) => [t.id, t]));
        const missing = data.transactions.filter((t) => !byId.has(t.id));
        // Entries already in the book that lost their category (shown as "Unknown")
        const broken = data.transactions.filter((t) => byId.has(t.id) && !known(byId.get(t.id).categoryId));
        if (!missing.length && !broken.length) return toast("Everything in this backup is already in the family book.");
        const parts = [missing.length && `add ${missing.length} entries`, broken.length && `fix the category on ${broken.length} entries`].filter(Boolean);
        if (!confirm(`From this backup: ${parts.join(" and ")}?`)) return;
        for (const t of missing) db.transactions.push({ ...t, categoryId: catFor(t), person: t.person || me() });
        for (const t of broken) byId.get(t.id).categoryId = catFor(t);
        save();
        render();
        return toast(`Done: ${parts.join(", ")}`);
      }
      if (!confirm(`Replace everything in the app with this backup (${data.transactions.length} entries)?`)) return;
      db = normalize(data);
      save();
      render();
      toast("Backup restored");
    } catch {
      toast("That doesn't look like a Money Book backup file.");
    }
  };
  reader.readAsText(file);
}

// ----- Reminders -----
function openReminders() {
  const s = db.settings;
  openSheet(`<h2>Daily reminder</h2>
    <form data-form="reminders">
      <label class="check"><input type="checkbox" name="on" ${s.reminderOn ? "checked" : ""}> Remind me if I haven't added anything today</label>
      <label class="field"><span>After this time</span><input type="time" name="time" value="${esc(s.reminderTime)}"></label>
      <p class="small muted">You'll see a reminder bar when you open the app after this time, and a phone notification if the app is still open in the background. Phones don't let offline web apps wake up by themselves, so for a guaranteed nudge also set a daily phone alarm.</p>
      <div class="actions"><button type="button" class="btn secondary" data-action="close-sheet">Cancel</button><button type="submit" class="btn">Save</button></div>
    </form>`);
}

function reminderDue() {
  const s = db.settings;
  if (!s.reminderOn) return false;
  const d = new Date();
  const now = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = todayISO();
  return now >= s.reminderTime && !db.transactions.some((t) => t.date === today && personOf(t) === me());
}

function checkReminder() {
  const due = reminderDue();
  $("#reminder-banner").hidden = !due;
  const today = todayISO();
  if (
    due &&
    document.hidden &&
    db.settings.lastNotified !== today &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    navigator.serviceWorker
  ) {
    navigator.serviceWorker.ready.then((reg) =>
      reg.showNotification("Money Book", {
        body: "You haven't added any entries today.",
        icon: "icons/icon-192.png",
        tag: "daily-reminder",
      })
    );
    db.settings.lastNotified = today;
    save();
  }
}

// ----- Theme -----
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const t = db.settings.theme;
  const dark = t === "dark" || (t === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $('meta[name="theme-color"]').content = dark ? "#0f2a2a" : "#0f766e";
}
darkQuery.addEventListener?.("change", applyTheme);

function openTheme() {
  const opt = (v, label) =>
    `<button class="chip ${db.settings.theme === v ? "on" : ""}" data-action="set-theme" data-theme="${v}">${label}</button>`;
  openSheet(`<h2>Theme</h2>
    <div class="chips" style="margin-bottom:16px">${opt("system", "Auto (follow phone)")}${opt("light", "Light")}${opt("dark", "Dark")}</div>
    <div class="actions"><button class="btn secondary" data-action="close-sheet">Done</button></div>`);
}

// ---------- Family sync (Supabase) ----------
// Each phone keeps a full copy (so it works offline) and swaps changes with the family book online.
// Only the family login can read the data (see supabase-setup.sql).
const SB = {
  url: localStorage.getItem("money-book-sb-url") || "https://nlmsnzrzpmfhorgbmhnw.supabase.co",
  key: "sb_publishable_NJiJbV0uq6wabv6fOgJ26A__BtjCEAu",
};
const SYNC_KEY = "money-book-sync";
// Shared family setup, saved online as one row each
const HH_KEYS = ["categories", "budgets", "recurring", "goals", "rules", "methods", "people"];

function loadSync() {
  const empty = { session: null, me: null, outbox: {}, dirty: [], cursor: "", deleted: [], lastSync: 0, status: "" };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(SYNC_KEY) || "{}") };
  } catch {
    return empty;
  }
}
function saveSync() {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  } catch {
    /* storage full: the next save will try again */
  }
}
// `var` so functions above can read these during start-up
var sync = loadSync();
function connected() {
  return !!sync.session;
}
function me() {
  return sync.me || "yadunath";
}

const hhGet = (k) => (k === "methods" ? db.settings.methods : db[k]);
function hhSet(k, v) {
  if (k === "methods") db.settings.methods = v;
  else db[k] = v;
}

// What the family book already has (or has been queued). Comparing against it shows what changed.
var snap = null;
function takeSnapshot() {
  snap = {
    e: new Map(db.transactions.map((t) => [t.id, JSON.stringify(t)])),
    h: Object.fromEntries(HH_KEYS.map((k) => [k, JSON.stringify(hhGet(k))])),
  };
}
function queueChanges() {
  if (!connected()) return;
  if (!snap) takeSnapshot();
  const now = new Map();
  for (const t of db.transactions) {
    const j = JSON.stringify(t);
    now.set(t.id, j);
    if (snap.e.get(t.id) !== j) sync.outbox[t.id] = t;
  }
  for (const id of snap.e.keys()) if (!now.has(id)) sync.outbox[id] = null; // null = deleted
  for (const k of HH_KEYS) {
    const j = JSON.stringify(hhGet(k));
    if (snap.h[k] !== j) {
      if (!sync.dirty.includes(k)) sync.dirty.push(k);
      snap.h[k] = j;
    }
  }
  snap.e = now;
  saveSync();
}

let pushTimer = null;
function schedulePush() {
  if (!connected()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(runSync, 800);
}

async function authRequest(grant, body) {
  const res = await fetch(`${SB.url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: SB.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.msg || data.message || "Sign in failed");
    err.status = res.status;
    throw err;
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    userId: data.user?.id,
    email: data.user?.email,
  };
}

async function token() {
  const s = sync.session;
  if (Date.now() < s.expiresAt - 60000) return s.access;
  try {
    sync.session = await authRequest("refresh_token", { refresh_token: s.refresh });
  } catch (err) {
    if (err.status >= 400 && err.status < 500) err.needsLogin = true;
    throw err;
  }
  saveSync();
  return sync.session.access;
}

async function api(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB.key, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB.url}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body) });
  if (!res.ok) {
    const err = new Error(`Sync error ${res.status}: ${await res.text().catch(() => "")}`);
    err.status = res.status;
    if (res.status === 401) err.needsLogin = true;
    throw err;
  }
  return method === "GET" ? res.json() : null;
}

async function pullEntries(since) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api(
      `entries?select=id,data,deleted,updated_at&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.asc,id.asc&limit=1000&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// Apply the other phone's changes. Our own unsent changes win until they're sent.
function applyEntries(rows) {
  let changed = false;
  const byId = new Map(db.transactions.map((t) => [t.id, t]));
  for (const r of rows) {
    if (r.updated_at > sync.cursor) sync.cursor = r.updated_at;
    if (r.id in sync.outbox) continue;
    if (r.deleted) {
      if (byId.delete(r.id)) changed = true;
      if (!sync.deleted.includes(r.id)) sync.deleted.push(r.id);
    } else if (JSON.stringify(byId.get(r.id)) !== JSON.stringify(r.data)) {
      byId.set(r.id, r.data);
      changed = true;
    }
  }
  if (sync.deleted.length > 3000) sync.deleted = sync.deleted.slice(-2000);
  if (changed) db.transactions = [...byId.values()];
  return changed;
}

async function pullHousehold() {
  const rows = await api("household?select=key,data");
  let changed = false;
  for (const r of rows) {
    if (!HH_KEYS.includes(r.key) || sync.dirty.includes(r.key)) continue;
    if (JSON.stringify(hhGet(r.key)) !== JSON.stringify(r.data)) {
      hhSet(r.key, r.data);
      changed = true;
    }
  }
  return changed;
}

async function push() {
  const owner = sync.session.userId;
  const ids = Object.keys(sync.outbox);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const sent = chunk.map((id) => JSON.stringify(sync.outbox[id]));
    await api("entries?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: chunk.map((id) =>
        sync.outbox[id] ? { id, owner, data: sync.outbox[id], deleted: false } : { id, owner, data: {}, deleted: true }
      ),
    });
    // Only clear what didn't change again while we were sending
    chunk.forEach((id, n) => {
      if (JSON.stringify(sync.outbox[id]) === sent[n]) delete sync.outbox[id];
    });
    saveSync();
  }
  if (sync.dirty.length) {
    const keys = [...sync.dirty];
    const sent = keys.map((k) => JSON.stringify(hhGet(k)));
    await api("household?on_conflict=owner,key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: keys.map((k) => ({ owner, key: k, data: hhGet(k) })),
    });
    sync.dirty = sync.dirty.filter((k) => {
      const n = keys.indexOf(k);
      return n < 0 || JSON.stringify(hhGet(k)) !== sent[n];
    });
    saveSync();
  }
}

let syncing = null;
function runSync() {
  if (!connected() || sync.needsLogin) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await push();
      // Look back 2 minutes each time, so a change saved at the same moment is never missed
      const since = sync.cursor ? new Date(Date.parse(sync.cursor) - 120000).toISOString() : "1970-01-01T00:00:00Z";
      const changedE = applyEntries(await pullEntries(since));
      const changedH = await pullHousehold();
      sync.lastSync = Date.now();
      sync.status = "ok";
      if (changedE || changedH) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        takeSnapshot();
        generateRecurring();
        // Don't wipe what someone is typing in the search box
        if (ui.view === "list" && document.activeElement?.dataset?.filter) renderListResults();
        else render();
      }
    } catch (err) {
      if (err.needsLogin) {
        sync.needsLogin = true;
        sync.status = "login";
      } else sync.status = err instanceof TypeError ? "offline" : "error";
      console.warn("Sync failed:", err.message);
    } finally {
      syncing = null;
      saveSync();
      updateSyncStatus();
    }
  })();
  return syncing;
}

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return dateLabel(new Date(ms).toISOString().slice(0, 10));
}

function syncStatusText() {
  if (!connected()) return "";
  const waiting = Object.keys(sync.outbox).length + sync.dirty.length;
  if (sync.needsLogin) return "Sync stopped. Sign in again to keep syncing.";
  if (sync.status === "offline") return `Offline. ${waiting ? `${waiting} changes will sync when you're back online.` : "Will sync when you're back online."}`;
  if (sync.status === "error") return `Couldn't sync, will keep trying. ${waiting} changes waiting.`;
  if (waiting) return `Syncing ${waiting} changes…`;
  return `Signed in as ${sync.session.email || "family"}. Up to date, last synced ${sync.lastSync ? timeAgo(sync.lastSync) : "not yet"}.`;
}

function updateSyncStatus() {
  const el = $("#sync-status");
  if (el) el.textContent = syncStatusText();
  $("#sync-banner").hidden = !(connected() && sync.needsLogin);
}

// ----- Connect a phone -----
let pendingSession = null;

function openConnect(msg) {
  openSheet(`<h2>Connect family book</h2>
    <p class="small muted" style="margin-top:-6px">Use the family email and password you made in Supabase. You type this only once on this phone.</p>
    <form data-form="connect">
      <label class="field"><span>Family email</span><input name="email" type="email" required autocomplete="username" value="${esc(sync.session?.email || "")}"></label>
      <label class="field"><span>Family password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="small expense" style="margin-bottom:10px" ${msg ? "" : "hidden"}>${esc(msg || "")}</div>
      <div class="actions"><button type="button" class="btn secondary" data-action="close-sheet">Not now</button><button type="submit" class="btn">Connect</button></div>
    </form>`);
}

async function submitConnect(form) {
  const fd = new FormData(form);
  const btn = $("button[type=submit]", form);
  btn.disabled = true;
  btn.textContent = "Connecting…";
  let session;
  try {
    session = await authRequest("password", { email: fd.get("email").trim(), password: fd.get("password") });
  } catch (err) {
    return openConnect(err.status ? "That email or password didn't work. Check them and try again." : "No internet. Connect once while online.");
  }
  // Signing back in on a phone that was already connected: just carry on
  if (sync.session && sync.session.userId === session.userId) {
    sync.session = session;
    sync.needsLogin = false;
    saveSync();
    closeSheet();
    toast("Signed in again");
    return runSync();
  }
  pendingSession = session;
  openWhoAmI(true);
}

function openWhoAmI(connecting) {
  openSheet(`<h2>Who uses this phone?</h2>
    <p class="small muted" style="margin-top:-6px">Entries you add here are saved under this name. You can change it later in More.</p>
    <div class="stack">
      ${db.people
        .map((p) => `<button class="btn block ${p.id === me() ? "" : "secondary"}" data-action="pick-me" data-id="${esc(p.id)}" data-connecting="${connecting ? 1 : ""}">${esc(p.name)}</button>`)
        .join("")}
    </div>`);
}

async function pickMe(id, connecting) {
  sync.me = id;
  saveSync();
  if (!connecting) {
    ui.person = "all";
    closeSheet();
    render();
    return toast(`This phone now adds entries as ${personName(id)}`);
  }
  openSheet(`<h2>Connecting…</h2><p class="muted">Getting the family book. This takes a few seconds.</p>`);
  await finishConnect(pendingSession);
}

async function finishConnect(session) {
  const prev = sync;
  sync = { ...loadSync(), session, me: prev.me, outbox: {}, dirty: [], cursor: "", deleted: [], needsLogin: false };
  try {
    const remoteHH = await api("household?select=key,data");
    const remote = await pullEntries("1970-01-01T00:00:00Z");
    const remoteIds = new Set(remote.map((r) => r.id));
    const localOnly = db.transactions.filter((t) => !remoteIds.has(t.id));
    if (localOnly.length && !confirm(`Move the ${localOnly.length} entries on this phone into the family book as ${personName(sync.me)}'s?`)) {
      sync = prev;
      saveSync();
      return closeSheet();
    }
    if (remoteHH.length) {
      // The family book already has a setup: use it, and match this phone's categories by name
      const oldCats = db.categories;
      for (const r of remoteHH) if (HH_KEYS.includes(r.key)) hhSet(r.key, r.data);
      for (const t of localOnly) {
        if (db.categories.some((c) => c.id === t.categoryId)) continue;
        const old = oldCats.find((c) => c.id === t.categoryId);
        const match = old && db.categories.find((c) => c.type === old.type && c.name.toLowerCase() === old.name.toLowerCase());
        t.categoryId = match ? match.id : fallbackCategory(t.type)?.id;
      }
    } else {
      // First phone: this phone's setup becomes the family setup
      for (const r of db.recurring) if (!r.person) r.person = sync.me;
      sync.dirty = [...HH_KEYS];
    }
    for (const t of localOnly) {
      if (!t.person) t.person = sync.me;
      sync.outbox[t.id] = t;
    }
    db.transactions = [...remote.filter((r) => !r.deleted).map((r) => r.data), ...localOnly];
    for (const r of remote) {
      if (r.updated_at > sync.cursor) sync.cursor = r.updated_at;
      if (r.deleted) sync.deleted.push(r.id);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    takeSnapshot();
    saveSync();
    ui.person = "all";
    closeSheet();
    generateRecurring();
    render();
    toast("Connected to the family book");
    await runSync();
  } catch (err) {
    console.warn(err);
    sync = prev;
    saveSync();
    openConnect("Couldn't reach the family book. Check your internet and try again.");
  }
}

function signOut() {
  const waiting = Object.keys(sync.outbox).length + sync.dirty.length;
  const msg = waiting
    ? `${waiting} changes on this phone haven't reached the family book yet and will be lost. Sign out anyway?`
    : "Sign out this phone? Everything stays safe in the family book. This phone's copy is removed.";
  if (!confirm(msg)) return;
  localStorage.removeItem(SYNC_KEY);
  localStorage.removeItem(STORAGE_KEY);
  sync = loadSync();
  sync.promptSeen = true;
  saveSync();
  db = defaultData();
  snap = null;
  ui.person = "all";
  render();
  toast("Signed out");
}

function openPeople() {
  openSheet(`<h2>Names</h2>
    <form data-form="people">
      ${db.people.map((p) => `<label class="field"><span>Person ${db.people.indexOf(p) + 1}</span><input name="${esc(p.id)}" required maxlength="20" value="${esc(p.name)}"></label>`).join("")}
      <div class="actions"><button type="button" class="btn secondary" data-action="close-sheet">Cancel</button><button type="submit" class="btn">Save</button></div>
    </form>`);
}

// ---------- Event wiring ----------
const actions = {
  nav: (el) => {
    ui.view = el.dataset.view;
    window.scrollTo(0, 0);
    render();
  },
  "close-sheet": closeSheet,
  "edit-tx": (el) => openTxForm(el.dataset.id),
  "tx-type": (el) => {
    txDraft.type = el.dataset.type;
    if (cat(txDraft.categoryId).type !== txDraft.type) txDraft.categoryId = null;
    $("#tx-seg").innerHTML = segButtons();
    $("#cat-chips").innerHTML = catChips();
  },
  "pick-cat": (el) => {
    txDraft.categoryId = el.dataset.id;
    $("#cat-chips").classList.remove("need");
    $("#cat-chips").innerHTML = catChips();
  },
  "delete-tx": () => {
    if (!confirm("Delete this entry?")) return;
    db.transactions = db.transactions.filter((t) => t.id !== txDraft.id);
    save();
    closeSheet();
    render();
    toast("Deleted");
  },
  "toggle-filters": () => {
    ui.showFilters = !ui.showFilters;
    renderList();
  },
  "reset-filters": () => {
    resetFilters();
    renderList();
  },
  "export-filtered": () => exportCSV(applyFilters(ui.filters), `money-book-${ui.filters.from}-to-${ui.filters.to}.csv`),
  "export-all": () => {
    if (!db.transactions.length) return toast("No entries to export yet.");
    exportCSV(db.transactions, `money-book-all-${todayISO()}.csv`);
  },
  "edit-budgets": openBudgets,
  "open-categories": openCategories,
  "new-cat": () => openCategoryForm(null),
  "edit-cat": (el) => openCategoryForm(el.dataset.id),
  "delete-cat": (el) => deleteCategory(el.dataset.id),
  "open-recurring": openRecurring,
  "new-rec": () => openRecurringForm(null),
  "edit-rec": (el) => openRecurringForm(el.dataset.id),
  "delete-rec": (el) => {
    if (!confirm("Stop this repeating entry? Entries already added stay.")) return;
    db.recurring = db.recurring.filter((r) => r.id !== el.dataset.id);
    save();
    render();
    openRecurring();
  },
  "open-methods": openMethods,
  "new-goal": () => openGoalForm(null),
  "edit-goal": (el) => openGoalForm(el.dataset.id),
  "goal-money": (el) => openGoalMoney(el.dataset.id),
  "delete-goal": (el) => {
    if (!confirm("Delete this goal?")) return;
    db.goals = db.goals.filter((g) => g.id !== el.dataset.id);
    save();
    closeSheet();
    render();
  },
  "open-rules": openRules,
  "delete-rule": (el) => {
    db.rules = db.rules.filter((r) => r.id !== el.dataset.id);
    save();
    openRules();
  },
  "open-import": openImport,
  "import-preview": buildImportPreview,
  "import-commit": commitImport,
  backup,
  restore: () => $("#restore-file").click(),
  "clear-all": () => {
    if (!confirm("Delete ALL entries, budgets, goals and settings? This can't be undone.")) return;
    if (!confirm("Are you sure? Save a backup first if you might need this data.")) return;
    db = defaultData();
    save();
    render();
    toast("All data deleted");
  },
  "set-person": (el) => {
    ui.person = el.dataset.person;
    resetFilters();
    render();
  },
  "open-connect": () => openConnect(),
  "pick-me": (el) => pickMe(el.dataset.id, !!el.dataset.connecting),
  "pick-me-again": () => openWhoAmI(false),
  "open-people": openPeople,
  "sync-now": async () => {
    toast("Syncing…");
    await runSync();
    toast(sync.status === "ok" ? "Up to date" : syncStatusText());
    if (ui.view === "more") render();
  },
  "sign-out": signOut,
  "open-reminders": openReminders,
  "open-theme": openTheme,
  "set-theme": (el) => {
    db.settings.theme = el.dataset.theme;
    save();
    applyTheme();
    render();
    openTheme();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  e.preventDefault();
  actions[el.dataset.action]?.(el, e);
});

const formHandlers = {
  tx: saveTx,
  connect: submitConnect,
  people: (form) => {
    const fd = new FormData(form);
    db.people = db.people.map((p) => ({ ...p, name: (fd.get(p.id) || p.name).trim() || p.name }));
    save();
    closeSheet();
    render();
  },
  cat: saveCategory,
  rec: saveRecurring,
  methods: (form) => {
    const list = new FormData(form)
      .get("methods")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    db.settings.methods = [...new Set(list)];
    save();
    closeSheet();
    render();
  },
  budgets: (form) => {
    const fd = new FormData(form);
    db.budgets = {};
    for (const [id, v] of fd.entries()) {
      const n = round2(parseFloat(v));
      if (n > 0) db.budgets[id] = n;
    }
    save();
    closeSheet();
    render();
    toast("Budgets saved");
  },
  goal: (form) => {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const target = round2(parseFloat(fd.get("target")));
    if (!(target > 0)) return toast("Enter a target above zero.");
    const fields = {
      name: fd.get("name").trim(),
      target,
      saved: Math.max(0, round2(parseFloat(fd.get("saved")) || 0)),
      deadline: fd.get("deadline") || "",
    };
    if (id) Object.assign(db.goals.find((g) => g.id === id), fields);
    else db.goals.push({ id: uid(), ...fields });
    save();
    closeSheet();
    render();
  },
  "goal-money": (form, submitter) => {
    const g = db.goals.find((x) => x.id === form.dataset.id);
    const amount = round2(parseFloat(new FormData(form).get("amount")));
    if (!(amount > 0)) return toast("Enter an amount above zero.");
    g.saved = Math.max(0, round2(g.saved + (submitter?.value === "out" ? -amount : amount)));
    save();
    closeSheet();
    render();
    toast(g.saved >= g.target ? "Goal reached! 🎉" : "Updated");
  },
  rule: (form) => {
    const fd = new FormData(form);
    const keyword = fd.get("keyword").trim().toLowerCase();
    if (!keyword) return;
    db.rules.push({ id: uid(), keyword, categoryId: fd.get("categoryId") });
    save();
    openRules();
  },
  reminders: async (form) => {
    const fd = new FormData(form);
    db.settings.reminderOn = !!fd.get("on");
    db.settings.reminderTime = fd.get("time") || "21:00";
    save();
    closeSheet();
    render();
    if (db.settings.reminderOn && "Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* user said no, the in-app bar still works */
      }
    }
    toast(db.settings.reminderOn ? "Reminder on" : "Reminder off");
  },
};

document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  formHandlers[form.dataset.form]?.(form, e.submitter);
});

// Live filters on the Entries tab
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.filter;
  if (!key) return;
  ui.filters[key] = e.target.value;
  renderListResults();
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "import-file" && t.files[0]) return handleImportFile(t.files[0]);
  if (t.id === "restore-file" && t.files[0]) {
    restoreFrom(t.files[0]);
    t.value = "";
    return;
  }
  if (t.dataset.impInc !== undefined) {
    imp.items[t.dataset.impInc].include = t.checked;
    const n = imp.items.filter((x) => x.include).length;
    const btn = $('[data-action="import-commit"]');
    btn.textContent = `Import ${n} ${n === 1 ? "entry" : "entries"}`;
    btn.disabled = !n;
    return;
  }
  if (t.dataset.impCat !== undefined) {
    imp.items[t.dataset.impCat].categoryId = t.value;
    return;
  }
  if (t.dataset.imp) {
    const key = t.dataset.imp;
    if (key === "headerRow") {
      imp.headerRow = Math.min(imp.rows.length - 1, Math.max(0, (parseInt(t.value, 10) || 1) - 1));
      guessColumns();
    } else if (key === "fmt" || key === "mode" || key === "sign" || key === "method") imp[key] = t.value;
    else imp[key] = Number(t.value);
    renderImportMapping();
  }
});

// Top bar month arrows (on Reports they move a whole year)
$("#prev-month").addEventListener("click", () => {
  ui.month = addMonths(ui.month, ui.view === "reports" ? -12 : -1);
  resetFilters();
  render();
});
$("#next-month").addEventListener("click", () => {
  ui.month = addMonths(ui.month, ui.view === "reports" ? 12 : 1);
  resetFilters();
  render();
});
$("#fab").addEventListener("click", () => openTxForm(null));
$("#reminder-add").addEventListener("click", () => openTxForm(null));

// When the app comes back to the front (e.g. next day), add any due repeating entries and sync
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (generateRecurring()) render();
    else checkReminder();
    runSync();
  }
});
window.addEventListener("online", () => runSync());
$("#sync-signin").addEventListener("click", () => openConnect());

// ---------- Start ----------
applyTheme();
if (connected()) takeSnapshot();
generateRecurring();
render();
setInterval(checkReminder, 60 * 1000);
// Check the family book for the other phone's changes every 15 seconds while the app is open
setInterval(() => {
  if (!document.hidden) runSync();
}, 15 * 1000);
runSync();
// First open of this version: offer to connect the family book once
if (!connected() && !sync.promptSeen) {
  sync.promptSeen = true;
  saveSync();
  openConnect();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline mode not available:", err));
}
// Ask the browser not to clear this app's data when the phone is low on space
navigator.storage?.persist?.();
