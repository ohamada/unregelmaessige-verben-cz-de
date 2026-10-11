# German irregular verbs

A static web app for learning and practising German irregular verbs
(Präsens, Präteritum, Perfekt). Practice works either by typing the forms or
by picking the right form from four options; each verb is shown with a picture (emoji). User interface in English, German and Czech.

## Hosting

Upload these to the web root: `index.html`, `favicon.svg`, `.htaccess` and the
folders `css/`, `js/`, `fonts/`. Do **not** upload `.git/`, `README.md` or
`CLAUDE.md` (`.htaccess` blocks them anyway, as a safety net).
No server-side code, no database, no build step. You can also just open
`index.html` locally in a browser.

`.htaccess` (for Apache hosting) adds the security headers and redirects
http to https, so turn on an SSL certificate at your host first (usually a
free Let's Encrypt option). On nginx hosting, `.htaccess` is ignored. The
page still has its Content-Security-Policy as a `<meta>` tag, but ask the host
to add the headers from `.htaccess`.

```
index.html        page
css/style.css     styles (responsive, light/dark mode)
js/verbs.js       verb list – edit this to add or fix verbs
js/i18n.js        UI texts in en / de / cs
js/app.js         application logic
favicon.svg
```

The page loads nothing from other sites. The Literata font is self-hosted in
`fonts/` (SIL Open Font License, see `fonts/OFL.txt`).

## Adding verbs

One line per verb in `js/verbs.js`:

```
infinitive|er-present|Präteritum|aux|Partizip II|English|Czech|picture
fahren|fährt|fuhr|s/h|gefahren|to drive, go, ride|jet, řídit|🚗
```

`aux` is `h` (hat), `s` (ist), or `s/h` / `h/s` when both are used. Alternative
forms are separated by `/` (e.g. `backte/buk`); all of them are accepted.
The picture is any emoji. Wrong options for the pick mode are generated
automatically from the correct forms.

The interface starts in Czech; the language can be switched in the header.
Settings (language, chosen forms, number of verbs) are kept in the browser's
localStorage only.
