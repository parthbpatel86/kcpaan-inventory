# Designing for older Gujarati staff who are not comfortable with phones

Parth: "the users are old gujarati people who dont know how to use phone
properly... Simple and less click."

This is the research, what our app measured against it, and what changed.

## What the research says (with numbers, not opinions)

Sources: *Accessibility Recommendations for Designing Better Mobile
Application User Interfaces for Seniors* (arXiv 2504.12690), *Design
Guidelines of Mobile Apps for Older Adults: Systematic Review* (JMIR mHealth
2023), WCAG 1.4.6 / 1.4.12, Google Material and Apple HIG touch guidance.

| Rule | Number |
|---|---|
| Body text | **20pt minimum**, 24pt better, 30pt for critical numbers |
| Font weight | **700 (bold) minimum** — thin type disappears for ageing eyes |
| Contrast, body text | **7:1** (WCAG 1.4.6 AAA) |
| Contrast, large text | 4.5:1 |
| Touch targets | **48dp minimum**, with ~16dp padding around them |
| Line spacing | 1.5x the font size |
| Forms | Break into **one-question-per-screen wizards**, not long forms |
| Gestures | Avoid pinch/swipe-only actions. **Tap is the only reliable gesture.** |

One finding worth repeating: **78% of popular apps have UI elements that
actively obstruct older users** — small targets, low contrast, deep menus. The
default is to get this wrong.

## What our app measured (before)

Audited by grepping every style in the codebase:

- **123 text elements below the 20pt minimum.** 51 of them at 12–13pt.
- **Touch targets under 48dp:** seven at 24dp, plus several 34–44dp.
- **Contrast, measured not guessed:**
  - `text` #1C2620 on white — **15.58:1** ✅
  - `textMuted` #6B7770 — **4.67:1** ⚠️ large text only
  - `textLight` #9AA59E — **2.55:1** ❌ **fails outright**
  - `primary` #0F7B5A — **5.25:1** ⚠️ large text only

`textLight` was being used for placeholder text and hints — the exact content a
struggling user most needs to read.

## What changed

### 1. Colours that actually meet 7:1
`textMuted` and `textLight` darkened until they pass. `primary` darkened for
text use, with the original green kept for large buttons where 4.5:1 applies.

### 2. A type scale with a floor
Every size in the app now comes from one scale whose smallest step is 18pt, and
whose body default is 20pt. Nothing can silently be set to 12pt again.

### 3. Touch targets
All interactive elements to 56dp (above the 48dp minimum, because paan counter
staff will be in a hurry with wet hands).

### 4. Fewer taps
- Time Clock opens the **camera directly** — no menu step.
- One punch button instead of IN/OUT — the server knows which you need.
- Home shows **who is working right now** by name, so nobody hunts for it.

### 5. Tap only
No pinch, no swipe-to-delete, no long-press as the only route to anything.
Long-press remains as a *shortcut* where it exists, never as the only way.

## What is deliberately NOT changed

- **No language switcher.** Parth's call. Gujarati sits beside English on the
  words that matter; photos and colour carry the rest.
- **Emoji as icons.** They render identically on every Android version, need no
  icon font, and older users read them as pictures rather than symbols.
- **Colour is never the only signal.** Red/amber/green stock dots always sit
  next to a number or a word, because colour blindness rises with age.
