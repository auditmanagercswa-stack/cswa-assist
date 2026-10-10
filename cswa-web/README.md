# CSWA Website

A responsive financial-services website for **CSWA Group of Companies**.

- **Frontend:** React 18 + Vite (`client/`)
- **Backend:** Node.js + Express (`server/`)
- **Design:** soft blues and cool greys with a muted teal accent, set in Book Antiqua

## Sections

Header with mobile menu → Hero → Services → Animated statistics → About → Testimonials → Contact form → Footer (contact info, social links, newsletter signup)

## Getting started

```bash
cd cswa-web
npm install          # installs the dev runner (concurrently)
npm run install:all  # installs server + client dependencies
npm run dev          # API on :5000, site on http://localhost:5173
```

### Production

```bash
npm run build        # builds the React app into client/dist
npm start            # Express serves the site + API on http://localhost:5000
```

Set `PORT` to change the port.

## Customising

| What you want to change | Where |
| --- | --- |
| Text, services, stats, testimonials, contact details, social links | `server/data/content.js` |
| Colours, font, corner radius, shadows, animation speed | `client/src/styles/theme.css` |
| Section order or adding/removing sections | `client/src/App.jsx` |
| Navigation links | `NAV_LINKS` in `client/src/components/Header.jsx` |
| Service icons | `client/src/components/Icon.jsx` |
| Testimonial photos | Put images in `client/public/avatars/` and set `avatar: '/avatars/name.jpg'` |
| What happens to form submissions | `server/routes/api.js` |

> **Before going live:** the statistics and testimonials in `content.js` are
> sample placeholders. Replace them with real figures and genuine client
> feedback. Contact and newsletter submissions are only kept in memory, so
> connect `server/routes/api.js` to email, a database or a spreadsheet.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/content` | All site content |
| POST | `/api/contact` | `{ name, email, phone?, message }` |
| POST | `/api/newsletter` | `{ email }` |

## Project structure

```
cswa-web/
├── server/
│   ├── index.js            Express app (API + serves client/dist in production)
│   ├── routes/api.js       Content, contact and newsletter endpoints
│   └── data/content.js     All editable site content
└── client/
    ├── index.html
    └── src/
        ├── App.jsx         Page layout, loads content from the API
        ├── api.js          Fetch helpers
        ├── hooks/          useInView (scroll reveal), useCountUp (stat counters)
        ├── styles/         theme.css (design tokens), global.css (base + buttons)
        └── components/     Header, Hero, Services, Stats, About,
                            Testimonials, Contact, Footer (+ one CSS file each)
```
