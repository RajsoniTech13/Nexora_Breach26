// src/types/receipt.types.ts

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;        // price per unit
  totalPrice: number;   // quantity × price
}

export interface ParsedReceipt {
  merchant: string | null;       // "Dominos", "Big Bazaar", etc.
  date: string | null;           // "2026-03-13" (ISO format)
  subtotal: number | null;       // before tax
  tax: number | null;            // tax amount
  total: number;                 // final total (REQUIRED — most important)
  currency: string;              // "INR", "USD"
  items: ReceiptItem[];          // itemized list (if readable)
  paymentMethod: string | null;  // "UPI", "CASH", "CARD"
  rawText: string | null;        // optional: the raw text Gemini read
  confidence: number;            // 0-100, how confident Gemini is
}

export interface ReceiptScanResult {
  success: boolean;
  data: ParsedReceipt | null;
  error: string | null;
}