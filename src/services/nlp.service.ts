import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { ParsedExpense } from '../types/nlp.types.js';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/**
 * parseExpenseText
 *
 * Converts a free-form natural language expense description into a structured
 * ParsedExpense object that can directly pre-fill the Add Expense form.
 *
 * @param text         The user's sentence  ("I paid 1500 for pizza with Alice")
 * @param currentUser  {id, name} of the authenticated user making the request
 * @param groupMembers All members in the group — fed to the AI so it can map
 *                     human names to real UUIDs
 */
export async function parseExpenseText(
  text: string,
  currentUser: { id: string; name: string },
  groupMembers: Array<{ id: string; name: string }>
): Promise<ParsedExpense> {

  // ── Step 1: Build the dynamic members context string ──────────────────────
  const membersContext = groupMembers
    .map((m) => `- ${m.name} (ID: ${m.id})`)
    .join('\n');

  // ── Step 2: Bulletproof system prompt ─────────────────────────────────────
  // Every word here matters. Low temperature + json_object mode means the model
  // follows these rules rigidly.
  const systemPrompt = `You are a financial AI assistant for an expense splitting app called Nexora.
Your ONLY job is to extract expense details from the user's sentence and return a valid JSON object.

=== AVAILABLE GROUP MEMBERS ===
${membersContext}

=== CURRENT USER (the person speaking) ===
${currentUser.name} (ID: ${currentUser.id})

=== JSON SCHEMA (return EXACTLY this structure) ===
{
  "amount": <number — total amount paid, e.g. 1500>,
  "description": <string — short 2-5 word description of what the expense was for>,
  "category": <string — MUST be one of: "food", "travel", "household", "entertainment", "rent", "other">,
  "split_type": <string — MUST be one of: "equal", "percentage", "custom">,
  "paid_by": <string — User ID of the payer from the members list above>,
  "splits": [
    {
      "user_id": <string — User ID from the members list above>,
      "amount": <number — ONLY include if split_type is "custom">,
      "percentage": <number — ONLY include if split_type is "percentage">
    }
  ]
}

=== RULES ===
1. Map names from the user's text to the EXACT User IDs in the members list.
   Use fuzzy matching — "Ali" maps to "Alice", "bob" maps to "Bob", etc.
2. If user says "split equally with X and Y", include the PAYER in the splits too (3-way split).
3. If no payer is mentioned, assume the Current User paid.
4. If no split is specified, do an equal split among ALL group members.
5. category must be one of the 6 allowed values. Choose the closest match.
6. split_type must be one of: "equal", "percentage", "custom".
7. For equal splits, include ONLY user_id in each splits entry (no amount or percentage).
8. RETURN ONLY THE JSON OBJECT. No markdown, no backticks, no explanation text.`;


  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    max_tokens: 512,
  });

  // ── Step 4: Parse the response ────────────────────────────────────────────
  const resultText = chatCompletion.choices[0]?.message?.content ?? '{}';

  try {
    const parsedData: ParsedExpense = JSON.parse(resultText);
    return parsedData;
  } catch {
    throw new Error('AI failed to generate valid structured data.');
  }
}