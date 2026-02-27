# Bitespeed Backend Task – Identity Reconciliation
## Overview
This project implements the Identity Reconciliation service for Bitespeed.
The /identify endpoint links multiple contacts (email and phone numbers) to a single customer identity.

## The service:
Creates a new primary contact if none exists
Creates secondary contacts when new information is provided
Merges multiple primary contacts correctly
Always keeps the oldest contact as primary

## Tech Stack
Node.js
TypeScript
Express
Prisma ORM
Supabase (PostgreSQL)
Hosted on Render

## Live Deployment
Base URL:
https://bitespeed-backend-task-2rua.onrender.com/

Identify Endpoint:
POST https://bitespeed-backend-task-2rua.onrender.com/identify

## API Usage
Endpoint
```
POST /identify
Request Body (JSON)
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
```
At least one field must be provided.

Example Request
```
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```
Example Response
```
{
  "contact": {
    "primaryContatctId": 1,
    "emails": [
      "lorraine@hillvalley.edu",
      "mcfly@hillvalley.edu"
    ],
    "phoneNumbers": [
      "123456"
    ],
    "secondaryContactIds": [2]
  }
}
```
## Local Setup
Clone the repository
git clone <your-repo-url>
cd bitespeed-identify

Install dependencies
npm install
Create .env file
DATABASE_URL=your_supabase_session_pooler_url
PORT=3000

Generate Prisma client
npx prisma generate
Run migration
npx prisma migrate dev --name init

Start server
npm run dev

Server runs at:
http://localhost:3000

Author
Pawan Patil
Backend Internship Assignment Submission
Bitespeed

Your Name
Backend Internship Assignment Submission
Bitespeed
