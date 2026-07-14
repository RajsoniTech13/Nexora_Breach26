// src/types/nlp.types.ts

export interface ParsedSplit {
    user_id: string;
    amount?: number;
    percentage?: number;
}

export interface ParsedExpense {
    amount: number;
    description: string;
    category: string;
    split_type: 'equal' | 'percentage' | 'custom';
    paid_by: string; // user_id
    splits: ParsedSplit[];
}