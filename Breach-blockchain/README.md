# 🔗 Breach Blockchain Service

Welcome to the Blockchain anchoring service for **Nexora**!

## 🎯 Purpose
This lightweight Express.js microservice abstracts away the complexities of Web3 (Ethers.js, Hardhat). It exposes simple REST endpoints that the `Breach_Backend` hits to anchor cryptographic hashes of expenses and settlements directly onto the **Ethereum Sepolia** testnet, creating an immutable audit trail.

## 📂 Folder Structure
```
Breach-blockchain/
├── contracts/           # Solidity Smart Contracts (if applicable)
├── routes/              # Express routing for blockchain interactions
├── services/            # Core logic utilizing Ethers.js
├── utils/               # Helper functions
└── server.js            # Main entry point for the microservice
```

## 🔐 Environment Variables
Create a `.env` file in the `Breach-blockchain` root directory:

```env
# Port the service will run on (Default expected by backend is 4001)
PORT=4001

# Ethereum RPC Provider (e.g., Alchemy, Infura)
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Private key of the wallet deploying/anchoring transactions
PRIVATE_KEY=your_wallet_private_key

# Address of the deployed smart contract
CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

## 🚀 Installation & Running Locally

1. **Navigate to the blockchain directory:**
   ```bash
   cd Breach-blockchain
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the microservice:**
   ```bash
   npm start
   ```
   The service will start on `http://localhost:4001`.

## 🏗️ Build Instructions
Since this is a standard Node.js microservice without a compilation step, no build is required. Ensure dependencies are installed and run `npm start` for production environments.

## ⚠️ Common Issues

- **Port in Use**: If port `4001` is taken, you can change the `PORT` in your `.env`. Just remember to also update the `BLOCKCHAIN_SERVICE_URL` inside the `Breach_Backend/.env` file so they can communicate!
- **Transaction Failing / Out of Gas**: Ensure the wallet corresponding to the `PRIVATE_KEY` has sufficient Sepolia ETH to process transactions. You can obtain Sepolia ETH from online faucets.
- **RPC URL Errors**: Ensure your Alchemy/Infura node URL is correct and active.
