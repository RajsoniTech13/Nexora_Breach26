// src/services/receipt.service.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { ParsedReceipt, ReceiptScanResult } from '../types/receipt.types.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);


const RECEIPT_PROMPT = `You are a receipt data extraction assistant. 
Analyze this receipt image and extract the following information.

Return ONLY a valid JSON object with this EXACT schema (no markdown, no code fences, no explanation):

{
  "merchant": "string or null - store/restaurant name",
  "date": "string or null - date in YYYY-MM-DD format",
  "subtotal": "number or null - amount before tax",
  "tax": "number or null - tax amount",
  "total": "number - the final total amount paid (REQUIRED, best guess if unclear)",
  "currency": "string - ISO currency code like INR, USD, EUR. Default to INR if unclear",
  "items": [
    {
      "name": "string - item description",
      "quantity": "number - default 1 if not shown",
      "price": "number - price per unit",
      "totalPrice": "number - quantity × price"
    }
  ],
  "paymentMethod": "string or null - CASH, CARD, UPI, or null if not visible",
  "confidence": "number 0-100 - your confidence in the extraction accuracy"
}

Rules:
1. All monetary values must be plain numbers (no currency symbols)
2. If you cannot read a field clearly, use null
3. The "total" field is REQUIRED — estimate from items if the total line is unclear
4. items array can be empty [] if individual items are not readable
5. Return ONLY the JSON object, nothing else`;

// Array of free-tier compatible models to try, from newest/best to oldest fallback
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro'
];

/**
 * Main function: Takes a receipt image and returns structured data.
 * 
 * What this does, line by line:
 * - Initializes the Gemini client with your API key
 * - Iterates through a list of models (handling API version deprecations automatically)
 * - Has a carefully written prompt that forces Gemini to return ONLY valid JSON
 * - Converts the image to base64 and sends both the prompt + image to Gemini
 * - Cleans up the response (removes markdown wrappers)
 * - Parses the JSON and validates it
 * - Handles all error cases gracefully
 */
export async function scanReceipt(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ReceiptScanResult> {
  const base64Image = imageBuffer.toString('base64');
  let lastError: Error | null = null;

  // Try each model sequentially until one works
  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        RECEIPT_PROMPT,
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
      ]);

      const text = result.response.text();

      // Clean the response
      const cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed: ParsedReceipt = JSON.parse(cleanedText);

      // Validation
      if (typeof parsed.total !== 'number' || parsed.total <= 0) {
        return {
          success: false,
          data: null,
          error: 'Could not extract a valid total amount from the receipt',
        };
      }

      if (!Array.isArray(parsed.items)) parsed.items = [];
      if (!parsed.currency) parsed.currency = 'INR';

      return {
        success: true,
        data: parsed,
        error: null,
      };

    } catch (error: any) {
      // If it's a 404 (model not found) or 429 (quota), log it and try the NEXT model in the array
      console.warn(`[Gemini] Model ${modelName} failed:`, error.message);
      lastError = error;

      // If it's a specific safety error, stop immediately, do not try other models
      if (error.message?.includes('SAFETY')) {
        return {
          success: false,
          data: null,
          error: 'Image was blocked by safety filters. Please use a receipt photo.',
        };
      }

      // If it's a syntax error (bad JSON from AI), stop immediately
      if (error instanceof SyntaxError) {
        return {
          success: false,
          data: null,
          error: 'AI returned invalid data. Please try a clearer photo.',
        };
      }

      // Otherwise, continue the loop and try the next model
      continue;
    }
  }

  // If we exhaust the entire array of models and they all failed:
  console.error('All Gemini fallback models failed. Last error:', lastError);
  return {
    success: false,
    data: null,
    error: `Failed to scan receipt after trying all available models: ${lastError?.message || 'Unknown error occurred'}`,
  };
}