# ⚡ SplitPass — Group Buy Coordination App

A full-stack web app to coordinate legal group-buys for Spotify, Netflix, Claude AI, ChatGPT, YouTube Premium, and more — using official family/group plans.

## Tech Stack
- **Frontend**: React 18, plain CSS (no UI library)
- **Backend**: Node.js + Express, PostgreSQL via Prisma ORM

## Project Structure
```
groupbuy/
├── backend/
│   ├── src/server.js       ← Express API (Prisma-backed)
│   ├── prisma/schema.prisma ← PostgreSQL schema
│   ├── prisma/migrations/  ← SQL migrations
│   └── package.json
└── frontend/
    ├── public/index.html
    ├── src/
    │   ├── App.js / App.css
    │   ├── index.js / index.css
    │   ├── api.js
    │   ├── components/
    │   │   ├── Header.js / Header.css
    │   │   └── GroupCard.js / GroupCard.css
    │   └── pages/
    │       ├── HomePage.js / HomePage.css
    │       ├── GroupsPage.js
    │       ├── GroupDetailPage.js / GroupDetailPage.css
    │       └── CreateGroupPage.js / CreateGroupPage.css
    └── package.json
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/services | List all supported services & plans |
| GET | /api/groups | List all groups |
| POST | /api/groups | Create a new group |
| GET | /api/groups/:id | Get group details |
| POST | /api/groups/:id/join | Join a group |
| PATCH | /api/groups/:id/status | Update group status |
| POST | /api/groups/:groupId/payments | Record a payment |
| GET | /api/stats | Get site-wide stats |
