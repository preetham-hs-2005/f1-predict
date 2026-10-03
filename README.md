# F1 Prediction League

## Email and prediction reminders

The API and notification runner are separate processes. Configure `server/.env` using `server/.env.example` (use a Resend sending API key, a verified sender address, a strong JWT secret, MongoDB, and the public `APP_URL`). From `server/`, run `npm run dev` for the API and `npm run worker` in a second terminal. Production uses the free GitHub Actions workflow to call a token-protected runner endpoint on Render every five minutes. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and timing limits. The runner retries queued welcome and race emails with backoff. Password reset mail is sent directly so the raw reset link is never stored in the mail queue.

Set `SMTP_FROM="F1 Predictor Pro <noreply@f1predict.dev>"` in the backend environment. The domain must be verified for sending by Resend; the domain registrar's email-forwarding rule only handles incoming mail. Render Free blocks SMTP ports, so the backend uses Resend's HTTPS API. Existing `SMTP_PASS` values also work as the API key.

To review the email designs with a registered account, run `npm run preview:emails -- user@example.com` from `server/`. This sends four clearly labelled preview messages (welcome, race week, Grand Prix qualifying, sprint qualifying) and one real password-reset email. The reset link expires after 30 minutes and replaces any earlier reset link. Use this only for an address you control.
Add `--skip-reset` to send just the four preview messages without replacing an existing reset link.

The Monday race-week email is scheduled for 9:00 AM Asia/Kolkata. Grand Prix and sprint qualifying reminders are queued during the hour before each session and expire when the session starts. GitHub's free schedule may be delayed or skipped, so exact delivery time is not guaranteed. Admin race date and time fields are entered in India time and saved as absolute UTC timestamps. In-app alerts are stored until read and are visible from the navigation bell. Configure `VITE_API_URL` in the frontend to point to the deployed API. No email can be delivered until the Resend key is configured.

## Search visibility

`npm run build` generates crawlable HTML, unique titles and descriptions, canonical URLs, Open Graph previews, structured data, and `/sitemap.xml` for the public home, how-it-works, standings, and race-analysis pages. Account pages, the leaderboard, and prediction pages are marked `noindex`. The public page descriptions live in `seo/pages.json`; update them alongside page content and run `npm run test:seo` after building.

After deployment, add `https://f1predict.dev` to Google Search Console and Bing Webmaster Tools, verify ownership, and submit `https://f1predict.dev/sitemap.xml` in each. Use their URL inspection tools to confirm that public pages render and account pages remain excluded. Search visibility and AI citations are determined by each service and are not guaranteed by metadata alone.

A full-stack web application for Formula 1 enthusiasts to make race predictions, track predictions against actual results, and compete on a live leaderboard.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Scoring System](#scoring-system)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### User Management
- **User Registration** - Create account with email and password
- **User Authentication** - JWT-based authentication with secure tokens
- **User Sessions** - Persistent login with localStorage token storage
- **Profile Management** - View personal predictions and statistics

### Predictions
- **Submit Predictions** - Predict top 3 drivers and pole position for each race
- **Unexpected Statements** - Add creative predictions for bonus points
- **Prediction Tracking** - View history of all submitted predictions
- **Race Calendar** - See upcoming F1 races and deadlines

### Leaderboard & Scoring
- **Live Leaderboard** - Real-time rankings based on prediction accuracy
- **Points Calculation** - Automatic scoring against actual race results
- **Performance Metrics** - Track correct predictions, podium hits, and more
- **Personal Statistics** - View your rank and performance

### Admin Features
- **Race Results** - Submit official race results (P1, P2, P3, Pole)
- **Test Data Cleanup** - Remove test data from database
- **Score Calculation** - Automatic scoring engine

### Discussions & Polls
- **Discussion Threads** - Categorized discussions with real-time updates via WebSockets
- **Messaging System** - Send, edit, delete, and like messages
- **Polling System** - Single/multiple choice polls with real-time vote updates
- **Moderation** - Admin controls for deleting content and pinning discussions

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Context API
- **HTTP Client**: Fetch API with custom wrapper
- **Testing**: Vitest

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript with tsx loader
- **Database**: MongoDB Atlas (Cloud)
- **Authentication**: JWT (JSON Web Tokens)
- **Real-Time Comm**: WebSockets (`ws` standard) for instant chat & poll updates
- **Security**: bcryptjs for password hashing
- **Validation**: Custom validation middleware

### Infrastructure
- **Database System**: MongoDB Atlas
- **Environment**: Local development with npm/bun
- **CORS**: Configured for local development ports

## 📁 Project Structure

```
f1-predictor-pro/
├── server/                          # Express backend
│   ├── src/
│   │   ├── models/                 # Database Schemas
│   │   │   ├── User.ts
│   │   │   ├── Prediction.ts
│   │   │   ├── Results.ts
│   │   │   ├── Leaderboard.ts
│   │   │   ├── Discussion.ts       # Race discussions schemas
│   │   │   ├── Message.ts          # Discussion chat messages
│   │   │   ├── Poll.ts             # Discussion polls
│   │   │   └── PollVote.ts         # User poll votes   
│   │   ├── routes/                 # API Routes
│   │   │   ├── auth.ts
│   │   │   ├── predictions.ts
│   │   │   ├── leaderboard.ts
│   │   │   ├── discussions.ts      # Discussions & Polls endpoints
│   │   │   └── admin.ts            # System admin utilities
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verification
│   │   │   └── errorHandler.ts     # Error handling
│   │   ├── utils/
│   │   │   ├── db.ts               # MongoDB connection
│   │   │   └── jwt.ts              # JWT utilities
│   │   └── server.ts               # Express & WebSocket app setup
│   └── package.json
│
├── src/                             # React frontend
│   ├── components/
│   │   ├── layout/
│   │   │   └── Navbar.tsx          # Main navigation bar
│   │   ├── prediction/
│   │   │   └── PredictionForm.tsx  # Race predictions form
│   │   ├── dashboard/              # User dashboard widgets
│   │   ├── admin/                  # Content moderation components
│   │   ├── discussions/            # Realtime discussion & poll UIs
│   │   └── ui/                     # shadcn/ui shared components
│   ├── contexts/
│   │   └── AuthContext.tsx         # Global auth state
│   ├── hooks/                      # Custom data fetching hooks
│   │   ├── useLeaderboard.ts
│   │   ├── usePredictions.ts
│   │   ├── useDiscussions.ts       # Race discussions & voting hook
│   │   └── useRaceWeekends.ts
│   ├── lib/
│   │   ├── api/                    # Axios API request wrappers
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   ├── predictions.ts
│   │   │   ├── leaderboard.ts
│   │   │   └── discussions.ts
│   │   └── utils.ts
│   ├── pages/                      # Application Route Views
│   │   ├── Index.tsx               # Landing page
│   │   ├── Dashboard.tsx           # User Home
│   │   ├── Predict.tsx             # Predicition submission
│   │   ├── PredictionHistory.tsx   # Past race predictions
│   │   ├── Leaderboard.tsx         # Global rank standings
│   │   ├── Discussions.tsx         # Live WebSockets chat & polls
│   │   ├── Admin.tsx               # Admin moderation console
│   │   ├── Login.tsx               
│   │   ├── Register.tsx            
│   │   └── NotFound.tsx            
│   ├── App.tsx                     # React Router configurations
│   └── main.tsx                    # React Entry
│
├── public/                          # Static assets
├── index.html                       # HTML template
├── package.json                     # Frontend dependencies
├── tsconfig.json                    # TypeScript config
├── vite.config.ts                   # Vite config
└── README.md                        # This file
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16+ or **Bun**
- **MongoDB Atlas** account (free tier available at https://www.mongodb.com/cloud/atlas)
- **Git** for version control

### Installation

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd f1-predictor-pro
```

#### 2. Install Frontend Dependencies
```bash
npm install
# or
bun install
```

#### 3. Install Backend Dependencies
```bash
cd server
npm install
cd ..
```

#### 4. Set Up Environment Variables

**Frontend** (create `.env`):
```env
VITE_API_URL=http://localhost:3000
```

**Backend** (create `server/.env.local`):
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/f1_prediction_league?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

Replace with your MongoDB Atlas credentials.

## ⚙️ Configuration

### MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account or login
3. Create a new cluster
4. Get your connection string from "Connect" → "Drivers"
5. Add your IP address to the IP whitelist
6. Replace credentials in `server/.env.local`

### JWT Secret
Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use this value for `JWT_SECRET` in your `server/.env.local`

## 📦 Running the Application

### Development Mode

**Terminal 1 - Backend Server** (from `server` folder):
```bash
npm run dev
# Server will run on http://localhost:3000
```

**Terminal 2 - Frontend Server** (from root folder):
```bash
npm run dev
# Frontend will run on http://localhost:8080
```

Open your browser to **http://localhost:8080**

### Production Build

**Frontend**:
```bash
npm run build
npm run preview
```

**Backend**:
```bash
cd server
npm run build
node dist/server.js
```

## 🔌 API Endpoints

### Authentication (`/api/auth`)

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Driver",
  "email": "john@example.com",
  "password": "securepassword123"
}

Response: 201 Created
{
  "success": true,
  "user": {
    "id": "...",
    "name": "John Driver",
    "email": "john@example.com",
    "totalPoints": 0
  },
  "token": "eyJhbGc..."
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}

Response: 200 OK
{
  "success": true,
  "user": { ... },
  "token": "eyJhbGc..."
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "user": { ... }
}
```

### Predictions (`/api/predictions`)

#### Submit Prediction
```http
POST /api/predictions/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "raceWeekendId": "bahrain-2026",
  "predictedP1": "max_verstappen",
  "predictedP2": "charles_leclerc",
  "predictedP3": "lewis_hamilton",
  "predictedPole": "max_verstappen",
  "unexpectedStatement": "Optional creative prediction"
}

Response: 201 Created
```

#### Get User's Predictions
```http
GET /api/predictions/user
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "...",
      "raceWeekendId": "bahrain-2026",
      "predictedP1": "max_verstappen",
      ...
    }
  ]
}
```

### Leaderboard (`/api/leaderboard`)

#### Get Leaderboard
```http
GET /api/leaderboard?limit=50

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "userId": "...",
      "name": "John Driver",
      "totalPoints": 109,
      "correctWinners": 2,
      "exactPodiums": 1,
      "predictionsSubmitted": 2
    }
  ]
}
```

#### Get User's Position
```http
GET /api/leaderboard/me
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": { ... }
}
```

#### Submit Race Results (Admin)
```http
POST /api/leaderboard/results
Authorization: Bearer <token>
Content-Type: application/json

{
  "raceWeekendId": "bahrain-2026",
  "type": "race",
  "p1": "max_verstappen",
  "p2": "charles_leclerc",
  "p3": "lewis_hamilton",
  "pole": "max_verstappen"
}

Response: 201 Created
```

### Discussions & Polls
Full RESTful API available at `/api/discussions`:
- **Discussions**: `GET`, `POST`, `PATCH`, `DELETE` operations
- **Messages**: `GET`, `POST`, `PATCH`, `DELETE` nested under discussions, plus `like` action
- **Polls**: `GET`, `POST`, `DELETE` operations, plus `vote` and `close` actions
- **WebSockets**: Supports real-time updates for joining, messages, and poll-votes.

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  role: String ("user" or "admin"),
  totalPoints: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Predictions Collection
```javascript
{
  _id: ObjectId,
  userId: String,
  raceWeekendId: String,
  type: String ("sprint" or "race"),
  predictedP1: String (driver),
  predictedP2: String (driver),
  predictedP3: String (driver),
  predictedPole: String (driver),
  unexpectedStatement: String (optional),
  createdAt: Date,
  updatedAt: Date
}
```

### Results Collection
```javascript
{
  _id: ObjectId,
  raceWeekendId: String,
  type: String ("sprint" or "race"),
  p1: String (driver),
  p2: String (driver),
  p3: String (driver),
  pole: String (driver),
  createdAt: Date,
  updatedAt: Date
}
```

### Discussions & Poll Collections
- **discussions**: Discussion threads
- **messages**: Real-time websocket chat messages within discussions
- **polls**: User-generated or admin-generated polls inside of threads
- **pollVotes**: Dedicated vote counting to ensure single votes per user per poll

## 🎯 Scoring System

Points are awarded based on prediction accuracy:

| Achievement | Points |
|-------------|--------|
| Correct P1 (Winner) | 25 |
| Correct P2 | 18 |
| Correct P3 | 15 |
| Correct Pole Position | 5 |
| **Exact Podium** (all 3 correct) | +10 |
| **Unexpected Statement** | 3 |

**Example**: If you predict P1=Verstappen, P2=Leclerc, P3=Hamilton, Pole=Verstappen and all are correct:
- Correct P1: 25 points
- Correct P2: 18 points
- Correct P3: 15 points
- Correct Pole: 5 points
- Exact Podium Bonus: 10 points
- **Total: 73 points**

## 🔧 Development

### Available Scripts

**Frontend**:
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
npm run test     # Run tests
```

**Backend** (from `server` folder):
```bash
npm run dev      # Start dev server with hot reload
npm run build    # Build TypeScript
npm run start    # Run built version
```

### Code Structure

- **Models**: Database schema and operations
- **Routes**: API endpoint handlers
- **Middleware**: Authentication, error handling
- **Pages**: React route components
- **Hooks**: Custom React hooks for data fetching
- **Components**: Reusable UI components
- **Context**: Global state management

## 🐛 Troubleshooting

### MongoDB Connection Issues

**Error**: "Failed to connect to MongoDB"

**Solutions**:
1. Check MongoDB URI in `server/.env.local`
2. Verify IP is whitelisted in Atlas
3. Ensure database credentials are correct
4. Check internet connection

### Token/Authentication Issues

**Error**: "401 Unauthorized" or "Missing authentication token"

**Solutions**:
1. Clear browser localStorage: `localStorage.clear()`
2. Logout and login again
3. Check JWT_SECRET is set in `server/.env.local`
4. Verify token is sent in Authorization header: `Bearer <token>`

### CORS Errors

**Error**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solutions**:
1. Ensure backend is running on `http://localhost:3000`
2. Check CORS configuration in `server/src/server.ts`
3. Frontend should be on `http://localhost:8080`
4. Clear browser cache

### Port Already in Use

**Error**: "Address already in use :::3000" or ":::8080"

**Solutions**:
```bash
# Kill all Node processes (Windows PowerShell)
Get-Process -Name "node" | Stop-Process -Force

# Or kill specific port
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
```

### Build Errors

**Error**: "Cannot find module" or TypeScript errors

**Solutions**:
1. Delete `node_modules` and reinstall:
   ```bash
   rm -r node_modules
   npm install
   ```
2. Clear build cache:
   ```bash
   rm -r dist build
   npm run build
   ```

## 📝 Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "Add new feature"

# Push to repository
git push origin feature/new-feature
```

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues, questions, or suggestions, please open an issue in the repository.

---

## Quick Start Checklist

- [ ] Clone repository
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env` and `server/.env.local` files
- [ ] Set up MongoDB Atlas account
- [ ] Generate JWT secret
- [ ] Start backend (`npm run dev` from `server/`)
- [ ] Start frontend (`npm run dev` from root)
- [ ] Open http://localhost:8080
- [ ] Register new account
- [ ] Submit predictions
- [ ] Check leaderboard

**Enjoy the F1 Prediction League! 🏁**
