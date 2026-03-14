import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const MOCK_MODE = String(process.env.BLOCKCHAIN_MOCK_MODE || '').toLowerCase() === 'true';
const mockRecords = new Map();

/*
Resolve directory path
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
Load contract ABI
*/

const abiPath = path.join(__dirname, "../contracts/abi.json");

const abi = JSON.parse(
  fs.readFileSync(abiPath, "utf8")
);

/*
Blockchain provider
*/

let provider;
let wallet;
let contract;

/*
Wallet
*/

function getContract() {
  if (MOCK_MODE) {
    return null;
  }

  if (contract) {
    return contract;
  }

  if (!process.env.RPC_URL || !process.env.PRIVATE_KEY || !process.env.CONTRACT_ADDRESS) {
    throw new Error('RPC_URL, PRIVATE_KEY and CONTRACT_ADDRESS are required when BLOCKCHAIN_MOCK_MODE is disabled');
  }

  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, wallet);

  return contract;
}


/*
ANCHOR EXPENSE
Store expense hash on blockchain
*/

export async function anchorExpense(expenseId, groupId, hash) {

  try {

    if (MOCK_MODE) {
      if (mockRecords.has(expenseId)) {
        throw new Error('Already exists');
      }
      mockRecords.set(expenseId, { hash, groupId, recordType: 'EXPENSE' });
      return `mock-expense-${expenseId}`;
    }

    const liveContract = getContract();

    const tx = await liveContract.anchorExpense(
      expenseId,
      groupId,
      hash
    );

    await tx.wait();

    return tx.hash;

  } catch (error) {

    throw new Error(`Expense anchoring failed: ${error.message}`);

  }

}


/*
ANCHOR SETTLEMENT
Store settlement hash on blockchain
*/

export async function anchorSettlement(settlementId, groupId, hash) {

  try {

    if (MOCK_MODE) {
      if (mockRecords.has(settlementId)) {
        throw new Error('Already exists');
      }
      mockRecords.set(settlementId, { hash, groupId, recordType: 'SETTLEMENT' });
      return `mock-settlement-${settlementId}`;
    }

    const liveContract = getContract();

    const tx = await liveContract.anchorSettlement(
      settlementId,
      groupId,
      hash
    );

    await tx.wait();

    return tx.hash;

  } catch (error) {

    throw new Error(`Settlement anchoring failed: ${error.message}`);

  }

}


/*
ANCHOR LEDGER ENTRY
Store ledger hash on blockchain
*/

export async function anchorLedgerEntry(entryId, groupId, hash) {

  try {

    if (MOCK_MODE) {
      if (mockRecords.has(entryId)) {
        throw new Error('Already exists');
      }
      mockRecords.set(entryId, { hash, groupId, recordType: 'LEDGER' });
      return `mock-ledger-${entryId}`;
    }

    const liveContract = getContract();

    const tx = await liveContract.anchorLedgerEntry(
      entryId,
      groupId,
      hash
    );

    await tx.wait();

    return tx.hash;

  } catch (error) {

    throw new Error(`Ledger anchoring failed: ${error.message}`);

  }

}


/*
VERIFY RECORD
Check if hash exists on blockchain
*/

export async function verifyRecord(referenceId, hash) {

  try {

    if (MOCK_MODE) {
      const record = mockRecords.get(referenceId);
      return Boolean(record && record.hash === hash);
    }

    const liveContract = getContract();

    const valid = await liveContract.verifyRecord(
      referenceId,
      hash
    );

    return valid;

  } catch (error) {

    throw new Error(`Verification failed: ${error.message}`);

  }

}