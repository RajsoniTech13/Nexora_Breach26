# 🚀 Nexora: AI-Powered Expense Intelligence

Nexora is an intelligent expense tracking platform that eliminates manual data entry using AI. It transforms traditional expense management into a seamless, conversational experience powered by computer vision and natural language processing.

---

## ✨ Key Features

### 📸 AI Receipt Scanning
- Extracts merchant details, total amount, and line items from receipt images  
- Powered by **Gemini 2.5 Flash**  
- Processes inputs in ~2 seconds  

### 🗣️ NLP-Based Expense Entry
- Add expenses using voice or text commands  
- Example: *"I paid ₹1500 for pizza, split equally with Alice and Bob"*  
- Powered by **Llama 3.3 (Groq)**  

### ⚖️ Smart Split Engine
- Supports equal, percentage, and custom splits  
- Intelligent mapping of users for accurate expense distribution  

### 🔗 Blockchain Audit Layer
- Stores tamper-proof audit hashes on **Ethereum Sepolia**  
- Ensures data integrity and transparency  

---

## 🛠️ Tech Stack

### Frontend
- React.js / Next.js  
- Tailwind CSS  

### Backend
- Node.js  
- Express.js  
- JWT Authentication  

### Database
- PostgreSQL (Primary DB)  
- Redis (Rate Limiting & Caching)  

### AI Integration
- Gemini 2.5 Flash (OCR & Vision)  
- Llama 3.3 via Groq (NLP Processing)  

### Blockchain
- Ethereum Sepolia Testnet  

---

## 🧠 System Architecture

1. **Capture Layer**
   - User inputs via image (receipt) or voice/text  

2. **Processing Layer**
   - AI models extract structured data → converted into JSON  

3. **Storage Layer**
   - Data stored in PostgreSQL  
   - Audit hash anchored on blockchain  

4. **Security Layer**
   - Role-Based Access Control (RBAC)  
   - Input validation & sanitization  
   - Memory-only file handling (no persistent file storage)  

---

## 📈 Future Roadmap

- 🌐 Multi-language support (Hindi, Tamil, Telugu)  
- 🏦 Banking API integration for auto expense import  
- 💬 WhatsApp bot for conversational expense tracking  
- 🌏 Expansion to Southeast Asia markets  

---

## 🔗 Links

- 💻 GitHub: https://github.com/RajsoniTech13/Nexora_Breach26  
- 🌐 Live Demo: demo.nexora.app  
- 📩 Contact: team@nexora.app  

---

## ⭐ Why This Project Stands Out

- Combines AI + Backend + Blockchain in a real-world use case  
- Focuses on automation, scalability, and user experience  
- Demonstrates strong understanding of system design and modern architectures  

---

## ⚙️ Getting Started (Optional - Add if you want)

```bash
# Clone the repository
git clone https://github.com/RajsoniTech13/Nexora_Breach26.git

# Navigate into project
cd Nexora_Breach26

# Install dependencies
npm install

# Run the server
npm start
