# SplitSubs / Group Coordinator Tool

## Stack
- Frontend: React (CRA), no TypeScript, CSS modules
- Backend: Node.js + Express, Prisma ORM, PostgreSQL
- Payments: PesaPal
- Email: Resend
- Process manager: PM2
- Server: Ubuntu 24 @ 41.89.33.30 port 1013, user dodl

## Project structure
- /frontend/src/pages/ — page components
- /frontend/src/components/ — shared components
- /frontend/src/api.js — all API calls
- /backend/src/server.js — all routes
- /backend/src/emailService.js — email templates
- /backend/prisma/schema.prisma — DB schema

## Credential Vault model
Slots store: label, inviteLink, address, note
NO username or password fields — fully migrated

## Deploy
SSH into server: ssh -p 1013 dodl@41.89.33.30
Deploy script: cd /home/dodl/splitpass && ./deploy.sh

## Key rules
- Never commit node_modules, .env, frontend/build
- Always run npm run build after frontend changes
- PM2 process name: splitpass
