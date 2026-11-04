# Money Book

An income and expense tracker that installs on your phone and works with no internet.

**Family sync:** Yadunath and Radhika each use the app on their own phone and see each other's entries.
Each phone keeps a full copy (works offline) and swaps changes every ~15 seconds with a private Supabase
database (project `nlmsnzrzpmfhorgbmhnw`). The tables are created by `supabase-setup.sql`, and only the
family login can read them. Each person can only edit their own entries (the app enforces this).
Categories, budgets, repeating entries and goals are shared by the household.

## What it does

**Basics:** add an income or expense entry (amount, category, date, payment method, note), edit categories,
see the month's income, spending and what's left, edit or delete entries, and see a spending chart by category.

**Budgets and habits:** monthly budget per category (the bar turns red when you go over), repeating entries
(rent, salary, EMIs, added automatically each month), this month vs last month, search and filters,
payment method on every entry, and CSV export for Excel.

**Extras:** savings goals, a 12-month chart for the year, bank statement (CSV) import with automatic
categories, a daily reminder, dark mode, and backup/restore.

## Try it on your laptop

```bash
node dev-server.js
```

Then open http://localhost:5173

## Put it on your phone (one-time setup)

A phone can only install an offline app from a secure (https) website. So you put these files on a free host
once. Only the app's code goes there. Your money data never leaves your phone.

### Option A: GitHub Pages (free, permanent)

1. Make a free account at github.com and create a new **public** repository, e.g. `money-book`.
2. Click **Add file → Upload files** and drag in everything in this folder
   (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` and the `icons` folder).
3. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After about a minute your app is at `https://<your-username>.github.io/money-book/`

### Option B: Netlify (free account)

1. Log in at app.netlify.com, go to **Sites → Add new site → Deploy manually**.
2. Drag this whole folder onto the page. You get a link like `https://something.netlify.app`.

### Install it

- **Android (Chrome):** open your link, tap the ⋮ menu, then **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open your link, tap the Share button, then **Add to Home Screen**.

Open it once while online. After that it works fully offline, like a normal app.

## Keep your data safe

- Everything is stored in your phone's browser storage for this app.
- **More → Save backup file** now and then. Clearing Chrome/Safari site data, or uninstalling the app,
  deletes your entries. **More → Restore from backup** brings them back, on the same or a new phone.

## Bank statement import

Download your statement from net banking as **CSV**. If your bank only gives Excel, open it in Excel or
Google Sheets and use *Save as / Download as CSV*. Then go to **More → Import bank statement**.
The app finds the date, description and amount columns, sorts lines into categories using keywords
(e.g. "swiggy" → Food), and skips lines that look like entries you already have.
You can add your own keywords under **More → Auto-category keywords**.

## Changing the app later

When you change any file, also change `CACHE = "money-book-v1"` in `sw.js` (to `v2`, `v3`, ...)
and upload the files again. Phones pick up the new version the next time the app is opened online.
