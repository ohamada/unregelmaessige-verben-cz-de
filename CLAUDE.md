# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static web app for learning German irregular verbs (Präsens, Präteritum, Perfekt). It has an overview table and a practice mode, where you either type the forms or pick from 4 options. The interface is in Czech, German and English.

Hard constraints from the owner:
- It must run on plain static web hosting: no Node or other app server, no build step, no database.
- It must work well on smartphones.
- The default UI language is Czech, regardless of the browser locale. A language the user picks is remembered.

## Running and testing

- There's no build, no package.json and no linter. To run it, open `index.html` directly (it works over `file://`) or serve the folder with any static server, e.g. `python3 -m http.server`.
- There's no test suite in the repo. Changes were checked with temporary Playwright scripts kept outside the repo, using an iPhone/Pixel viewport and desktop. To check a change, drive a full session over all verbs (choose "all" in setup) and confirm that:
  - in typing mode, every correct form is accepted;
  - in pick mode, every option set has exactly 4 different options with exactly one correct.
- Block requests to `fonts.googleapis.com` in headless tests, or page load can hang.

## Architecture

The scripts load in order as plain `<script>` tags and share data through `window` globals. There are no modules.

1. `js/verbs.js` sets `window.VERB_DATA`: a template string with one verb per line:
   `infinitive|er-present|Präteritum|aux|Partizip II|English|Czech|emoji`
   - `aux` is `h`, `s`, `h/s` or `s/h`. When both are listed, the first is the more common.
   - Alternative forms are separated by `/`, and all of them count as correct.
   - The data is kept in a JS file, not JSON loaded with `fetch`, so the app still works from `file://`.
2. `js/i18n.js` sets `window.I18N.{en,de,cs}` with flat key → string tables. Placeholders are `{n}`, `{i}`, `{c}`, `{x}`. Every key must exist in all three languages.
3. `js/app.js` is a single IIFE that holds all logic:
   - **Parsing:** each data line becomes `{i, p[], t[], aux[], pp[], en, cs, pic}`. Tense keys are `p`, `t` and `pp` throughout: in settings, DOM ids (`#in-p`), `data-tense` attributes and results.
   - **i18n:** elements with `data-i18n`, `data-i18n-placeholder` or `data-i18n-aria` are filled by `applyLanguage()`. That function also re-renders the current view; while a practice is running, it calls `renderVerb(true)` so typed or picked answers survive a language switch.
   - **Meanings:** the Czech UI shows Czech meanings. The English and German UIs show English meanings.
   - **Routing:** only two hash routes, `#overview` and `#practice`. Inside practice, `showPractice()` switches between three panels: `#setup`, `#session` and `#results`.
   - **Session state** is the `session` object, which holds verbs, tenses, mode, index, results and checked. In pick mode it also holds `choice`: the generated options and the picks for the current verb. Each entry in `results` looks like `{verb, fields: {k: {status, given, match}}, ok}` in both modes, so `renderResults()` and "practise mistakes again" don't care which mode was used.
   - **Answer checking** (`normalize` / `fold` / `evaluate`):
     - Case and a leading `er`, `sie` or `es` are ignored.
     - Writing ä/ö/ü/ß as ae/oe/ue/ss is accepted, with the correct spelling shown.
     - Perfekt needs auxiliary + participle. A participle alone gets the status `aux`, which counts as wrong.
   - **Stem-vowel highlighting** (`lastVowelGroup` / `stem` / `highlight`): compares the last vowel group of each form's stem with the infinitive's and wraps the changed one in `<mark>`. It handles the `-et` linking vowel (bietet), `qu` (quillt) and keeps `ie` together (schrie, geschrien).
   - **Pick-mode distractors** (`wrongForms` / `buildOptions`): wrong options are generated from the correct forms, never stored in the data. They come in three tiers: typical mistakes (forms made regular, wrong auxiliary), then near misses, then other stem vowels. A candidate that matches any accepted answer (compared with `fold`) is dropped.
   - **Settings** (language, mode, tenses, count) are stored in `localStorage` under `irregular-verbs-settings`, and every access is wrapped in try/catch.

## Conventions

- `app.js` is written in ES5 style (`var`, `function`, no arrow functions) for old mobile browsers. Don't use regex lookbehind: older Safari throws a syntax error on it, and that would break the whole app.
- All UI text goes through `t(key)`. Any HTML built from data must go through `esc()`.
- Inputs use `font-size` ≥ 16px so iOS doesn't zoom in. Touch targets are at least 44px tall. Below 720px, the overview table becomes stacked cards using CSS grid areas.
- Colors are CSS custom properties on `:root`, with dark-mode overrides under `prefers-color-scheme`. Blue (`--blue`) is the brand and highlight color. Green and red are only for right and wrong answers.

## Security (keep these intact)

- The page loads nothing from other sites. The Literata font is self-hosted in `fonts/` (latin + latin-ext subsets, SIL OFL), because Google Fonts would send visitors' IPs to Google, which is a GDPR risk.
- A strict Content-Security-Policy allows only same-origin scripts, styles, images and fonts: no inline `<script>`, no `style="..."` attributes in markup, no `on*=` handlers, no `eval`. Setting `element.style.x` from JS is fine. The policy exists twice and both copies must stay in sync: in `.htaccess` (the full policy, plus `frame-ancestors`) and as a `<meta>` fallback in `index.html` for hosts that ignore `.htaccess`.
- `.htaccess` (Apache) also: returns 404 for dotfiles (`.git`!) and `*.md`, turns off directory listing, redirects http → https, and sets nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP and HSTS (https only).
- Values read from `localStorage` are whitelisted in `loadSettings()`. Never build selectors or HTML from stored values without validating them first.
- `.htaccess` was tested against a real Apache 2.4. When testing over plain http locally, send `X-Forwarded-Proto: https`, or the https redirect kicks in.
