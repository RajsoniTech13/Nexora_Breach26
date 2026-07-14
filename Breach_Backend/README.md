# ⚙️ Breach Backend

Welcome to the backend API service for **Nexora**!

## 🎯 Purpose
This Node.js + Express application is the core processing engine. It handles user authentication (JWT), interacts with the PostgreSQL database, communicates with Groq (Llama 3.3) and Gemini (2.5 Flash) for AI-driven expense intelligence, and pushes anchor hashes to the `Breach-blockchain` service.

## 📂 Folder Structure
```
Breach_Backend/
├── src/                 # Application source code
│   ├── lib/             # Utility clients (blockchainClient, envCheck)
│   ├── routes/          # Express route controllers (expenses, payments, etc.)
│   └── app.ts           # Main Express setup and middleware
├── migrations/          # Database migrations
├── .env.example         # Template for environment variables
└── package.json         # Node dependencies and scripts
```

## 🔐 Environment Variables
Create a `.env` file in the `Breach_Backend` root directory based on `.env.example`:

```env
PORT=3000
NODE_ENV=development

# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/nexora

# Redis (for caching and rate limiting)
REDIS_URL=redis://127.0.0.1:6379

# JWT Secrets for Auth
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key

# AI Integration Keys
GROQ_API_KEY=gsk_your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Blockchain Service Integration (Defaults to local port 4001)
BLOCKCHAIN_SERVICE_URL=http://localhost:4001
```

## 🚀 Installation & Running Locally

1. **Navigate to the backend directory:**
   ```bash
   cd Breach_Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The backend will start on `http://localhost:3000`.

## 🏗️ Build Instructions
If running a TypeScript setup, compile before deploying:
```bash
npm run build
npm start
```
*(Check your specific `package.json` for customized build scripts).*

## ⚠️ Common Issues

- **Database Connection Refused**: Make sure your local PostgreSQL server is running and the credentials in `DATABASE_URL` are correct.
- **AI Processing Fails**: Ensure your `GROQ_API_KEY` and `GEMINI_API_KEY` are valid and have sufficient quota.
- **Blockchain Warnings in Console**: If you see `[Blockchain] service unreachable — skipping`, it means the `Breach-blockchain` microservice is not running. Start it on port `4001`!
