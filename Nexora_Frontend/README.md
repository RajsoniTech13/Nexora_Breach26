# 💻 Nexora Frontend

Welcome to the frontend application for **Nexora**!

## 🎯 Purpose
This React + Vite application provides the user-facing interface for Nexora. It offers an elegant, mobile-first design leveraging Shadcn/UI for managing group expenses, uploading receipts (AI processing), and handling NLP-based voice commands.

## 📂 Folder Structure
```
Nexora_frontend/
├── public/              # Static assets (images, icons)
├── src/                 # Application source code
│   ├── api/             # API client (Axios/fetch wrappers) connecting to Backend
│   ├── components/      # Reusable UI components (Buttons, Modals, Forms)
│   ├── layouts/         # Page wrappers like AppShell and Sidebar
│   └── App.jsx          # Root component and Routing
├── .env                 # Environment variables (create this)
├── tailwind.config.js   # Tailwind CSS configuration
└── vite.config.js       # Vite configuration
```

## 🔐 Environment Variables
To connect this frontend to the backend service, you must create a `.env` file in the `Nexora_frontend` root directory:

```env
# URL for the Breach_Backend API (Defaults to localhost:3000 for local dev)
VITE_API_URL=http://localhost:3000

# Your Google OAuth Client ID for authentication
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

## 🚀 Installation & Running Locally

1. **Navigate to the frontend directory:**
   ```bash
   cd Nexora_frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

## 🏗️ Build Instructions
To build the frontend for production deployment:
```bash
npm run build
```
This generates an optimized production build inside the `dist/` directory, which can be deployed to Vercel, Netlify, or any static hosting provider.

## ⚠️ Common Issues

- **CORS Errors**: If you encounter CORS issues making API calls, ensure your `Breach_Backend` is running and properly configured to accept requests from `http://localhost:5173`. Check that `VITE_API_URL` exactly matches the backend URL without a trailing slash.
- **Google Sign-In Failing**: Ensure that `http://localhost:5173` is added to your authorized JavaScript origins in your Google Cloud Console.
- **Blank Screen on Load**: Make sure you are using Node.js v18+. Clear your browser cache or restart the Vite server.
