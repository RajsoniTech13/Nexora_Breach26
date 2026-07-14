# 🚀 Nexora: AI-Powered Expense Intelligence

Nexora is an intelligent expense tracking platform that eliminates manual data entry using AI. It transforms traditional expense management into a seamless, conversational experience powered by computer vision and natural language processing. 

This repository serves as the **official monorepo** for the entire Nexora platform.

---

## 🌟 Project Overview

Nexora handles expense tracking natively with smart integrations, bridging the gap between typical accounting apps and conversational AI interfaces. By incorporating blockchain, it also adds an immutable layer of trust for financial entries and settlements.

### ✨ Key Features

- **📸 AI Receipt Scanning**: Extracts merchant details, total amount, and line items from receipt images via **Gemini 2.5 Flash** (processes in ~2 seconds).
- **🗣️ NLP-Based Expense Entry**: Speak or type conversational commands (e.g., *"I paid ₹1500 for pizza, split equally with Alice and Bob"*) mapped via **Llama 3.3 (Groq)**.
- **⚖️ Smart Split Engine**: Intelligently handles equal, percentage, and custom splits for any size group.
- **🔗 Blockchain Audit Layer**: Automatically anchors tamper-proof audit hashes for expenses on **Ethereum Sepolia** to ensure ultimate data integrity.

---

## 📂 Repository Structure (Monorepo)

The project is structured into three main independent services:

```
Nexora_Breach26/
│
├── Nexora_frontend/       # React 18 + Vite + Tailwind UI (User Facing App)
├── Breach_Backend/        # Node.js + Express API + DB/AI integrations
├── Breach-blockchain/     # Smart Contracts & Express anchoring service
├── README.md              # You are here!
└── SYSTEM_DESIGN.md       # Detailed Architecture Documentation
```

- [**Frontend Documentation**](./Nexora_frontend/README.md)
- [**Backend Documentation**](./Breach_Backend/README.md)
- [**Blockchain Documentation**](./Breach-blockchain/README.md)

---

## 🛠️ Tech Stack

### Frontend (`Nexora_frontend`)
- **Framework**: React 18, Vite
- **Styling**: Tailwind CSS, Shadcn/UI
- **Auth**: Google OAuth

### Backend (`Breach_Backend`)
- **Framework**: Node.js, Express.js
- **Database**: PostgreSQL (Primary), Redis (Rate Limiting)
- **AI Models**: Gemini 2.5 Flash (Vision), Llama 3.3 via Groq (NLP)
- **Auth**: JWT Authentication (Access/Refresh Tokens)

### Blockchain (`Breach-blockchain`)
- **Network**: Ethereum Sepolia Testnet
- **Tools**: Hardhat, Ethers.js, Express (Microservice)

---

## ⚙️ Getting Started locally

To run the full stack locally, you need to spin up the three services independently. Follow the steps below or check their specific READMEs for more detailed instructions.

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **PostgreSQL** running locally
- **Redis** running locally

### 2. Clone the Repository
```bash
git clone https://github.com/RajsoniTech13/Nexora_Breach26.git
cd Nexora_Breach26
```

### 3. Run Blockchain Service (Port 4001)
```bash
cd Breach-blockchain
npm install
# Create a .env file (see Breach-blockchain/README.md)
npm run dev
```

### 4. Run Backend API (Port 3000)
```bash
cd ../Breach_Backend
npm install
# Create a .env file and add your DB, Groq, and Gemini keys
npm run dev
```

### 5. Run Frontend Client (Port 5173)
```bash
cd ../Nexora_frontend
npm install
# Create a .env file with VITE_API_URL=http://localhost:3000
npm run dev
```

---

## 🚀 Deployment Links

- **Frontend App**: [demo.nexora.app](https://demo.nexora.app) (Vercel)
- **Backend API**: Render Cloud
- **Blockchain**: Alchemy / Sepolia Testnet

---

## 📈 Future Roadmap

- 🌐 Multi-language support (Hindi, Tamil, Telugu)
- 🏦 Banking API integration for auto expense import
- 💬 WhatsApp bot for conversational expense tracking
- 🌏 Expansion to Southeast Asia markets

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

## 📩 Contact
- 💻 **GitHub**: [RajsoniTech13](https://github.com/RajsoniTech13)
- 📧 **Email**: team@nexora.app
