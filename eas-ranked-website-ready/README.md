# EAS Ranked Website

A ready-to-deploy Next.js dashboard for the EAS ranked Discord bot.

## Railway setup

Add this variable to the website service:

DATABASE_URL=your_postgres_url

Then deploy.

## Pages

- `/` leaderboard
- `/profile/[userId]` player profile
- `/api/leaderboard` database leaderboard API
- `/api/profile/[userId]` profile API
