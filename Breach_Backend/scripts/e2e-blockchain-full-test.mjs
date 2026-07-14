import pg from 'pg';

const api = 'http://localhost:3000/api/v1';
const chainApi = 'http://localhost:4001/blockchain';
const db = new pg.Pool({ connectionString: 'postgresql://user:password@localhost:5432/nexora' });
const rand = Math.random().toString(16).slice(2, 8);

const u1 = { email: `full_a_${rand}@test.local`, password: 'Password123!' };
const u2 = { email: `full_b_${rand}@test.local`, password: 'Password123!' };

const checks = [];

function pushCheck(name, pass, details) {
  checks.push({ name, pass, details });
}

const post = async (url, body, token) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
};

const out = {};

out.register1 = await post(`${api}/auth/register`, u1);
out.register2 = await post(`${api}/auth/register`, u2);
pushCheck('register users', out.register1.status === 201 && out.register2.status === 201, { status1: out.register1.status, status2: out.register2.status });

const login1 = await post(`${api}/auth/login`, u1);
const login2 = await post(`${api}/auth/login`, u2);
out.login1 = login1.status;
out.login2 = login2.status;
pushCheck('login users', login1.status === 200 && login2.status === 200, { status1: login1.status, status2: login2.status });

const token1 = login1.body?.data?.accessToken;
const user2Id = login2.body?.data?.user?.id;

out.createGroup = await post(`${api}/groups`, { name: `Full Chain ${rand}`, currency: 'INR' }, token1);
const groupId = out.createGroup.body?.data?.group?.id;
pushCheck('create group', out.createGroup.status === 201 && Boolean(groupId), { status: out.createGroup.status, groupId });

out.addMember = await post(`${api}/groups/${groupId}/members`, { userId: user2Id }, token1);
pushCheck('add member', out.addMember.status === 201, { status: out.addMember.status });

out.createExpense = await post(
  `${api}/groups/${groupId}/expenses`,
  {
    amount: 250.5,
    description: 'Full blockchain expense',
    splitType: 'equal',
    currency: 'INR',
    category: 'food',
    expenseDate: '2026-03-14',
    splits: [{ userId: user2Id }],
  },
  token1,
);

const expenseId = out.createExpense.body?.data?.expense?.id;
pushCheck('create expense', out.createExpense.status === 201 && Boolean(expenseId), { status: out.createExpense.status, expenseId });

out.createSettlement = await post(
  `${api}/groups/${groupId}/settlements`,
  { toUser: user2Id, amount: 100, currency: 'INR' },
  token1,
);
const settlementId = out.createSettlement.body?.data?.settlement?.id;
pushCheck('create settlement', out.createSettlement.status === 201 && Boolean(settlementId), { status: out.createSettlement.status, settlementId });

out.markCash = await post(`${api}/groups/${groupId}/payments/mark-cash`, { settlementId }, token1);
pushCheck('complete settlement (cash)', out.markCash.status === 200, { status: out.markCash.status });

await new Promise((r) => setTimeout(r, 1200));

const expenseLedger = await db.query(
  "select le.id, la.group_id, le.account_id, le.reference_id, le.reference_type, le.amount::text as amount, le.entry_type from ledger_entries le join ledger_accounts la on la.id=le.account_id where le.reference_id=$1 and le.reference_type='expense' order by le.created_at desc limit 1",
  [expenseId],
);

const settlementLedger = await db.query(
  "select le.id, la.group_id, le.account_id, le.reference_id, le.reference_type, le.amount::text as amount, le.entry_type from ledger_entries le join ledger_accounts la on la.id=le.account_id where le.reference_id=$1 and le.reference_type='settlement' order by le.created_at desc limit 1",
  [settlementId],
);

const expenseLedgerRow = expenseLedger.rows[0];
const settlementLedgerRow = settlementLedger.rows[0];
pushCheck('ledger entries created', Boolean(expenseLedgerRow?.id) && Boolean(settlementLedgerRow?.id), {
  expenseLedgerId: expenseLedgerRow?.id,
  settlementLedgerId: settlementLedgerRow?.id,
});

out.verifyExpense = await post(`${api}/blockchain/verify-expense`, { expenseId }, token1);
out.verifySettlement = await post(`${api}/blockchain/verify-settlement`, { settlementId }, token1);
out.verifyLedgerExpense = await post(`${api}/blockchain/verify-ledger`, { entryId: expenseLedgerRow?.id }, token1);
out.verifyLedgerSettlement = await post(`${api}/blockchain/verify-ledger`, { entryId: settlementLedgerRow?.id }, token1);

pushCheck('verify expense true', out.verifyExpense.status === 200 && out.verifyExpense.body?.data?.blockchain?.valid === true, out.verifyExpense.body);
pushCheck('verify settlement true', out.verifySettlement.status === 200 && out.verifySettlement.body?.data?.blockchain?.valid === true, out.verifySettlement.body);
pushCheck('verify expense-ledger true', out.verifyLedgerExpense.status === 200 && out.verifyLedgerExpense.body?.data?.blockchain?.valid === true, out.verifyLedgerExpense.body);
pushCheck('verify settlement-ledger true', out.verifyLedgerSettlement.status === 200 && out.verifyLedgerSettlement.body?.data?.blockchain?.valid === true, out.verifyLedgerSettlement.body);

const expenseDb = await db.query(
  "select id, group_id, paid_by as \"paidByUserId\", amount::text as amount, currency, coalesce(category,'') as category, description, expense_date::text as \"expenseDate\" from expenses where id=$1",
  [expenseId],
);
const settlementDb = await db.query(
  "select id, group_id as \"groupId\", from_user as \"fromUserId\", to_user as \"toUserId\", amount::text as amount, currency, settled_at::text as \"settledAt\" from settlements where id=$1",
  [settlementId],
);

const chainExpensePayload = {
  id: expenseDb.rows[0].id,
  groupId: expenseDb.rows[0].group_id,
  paidByUserId: expenseDb.rows[0].paidByUserId,
  amount: expenseDb.rows[0].amount,
  currency: expenseDb.rows[0].currency,
  category: expenseDb.rows[0].category,
  description: expenseDb.rows[0].description,
  expenseDate: expenseDb.rows[0].expenseDate,
};

const chainSettlementPayload = settlementDb.rows[0];
const chainExpenseLedgerPayload = {
  id: expenseLedgerRow.id,
  groupId: expenseLedgerRow.group_id,
  accountId: expenseLedgerRow.account_id,
  referenceId: expenseLedgerRow.reference_id,
  referenceType: expenseLedgerRow.reference_type,
  amount: expenseLedgerRow.amount,
  entryType: expenseLedgerRow.entry_type,
};

const chainSettleLedgerPayload = {
  id: settlementLedgerRow.id,
  groupId: settlementLedgerRow.group_id,
  accountId: settlementLedgerRow.account_id,
  referenceId: settlementLedgerRow.reference_id,
  referenceType: settlementLedgerRow.reference_type,
  amount: settlementLedgerRow.amount,
  entryType: settlementLedgerRow.entry_type,
};

out.chainVerifyExpenseTampered = await post(`${chainApi}/verify-expense`, { ...chainExpensePayload, amount: '999.99' });
out.chainVerifySettlementTampered = await post(`${chainApi}/verify-settlement`, { ...chainSettlementPayload, amount: '999.99' });
out.chainVerifyExpenseLedgerTampered = await post(`${chainApi}/verify-ledger`, { ...chainExpenseLedgerPayload, amount: '999.99' });
out.chainVerifySettlementLedgerTampered = await post(`${chainApi}/verify-ledger`, { ...chainSettleLedgerPayload, amount: '999.99' });

pushCheck('tampered expense verify false', out.chainVerifyExpenseTampered.status === 200 && out.chainVerifyExpenseTampered.body?.valid === false, out.chainVerifyExpenseTampered.body);
pushCheck('tampered settlement verify false', out.chainVerifySettlementTampered.status === 200 && out.chainVerifySettlementTampered.body?.valid === false, out.chainVerifySettlementTampered.body);
pushCheck('tampered expense-ledger verify false', out.chainVerifyExpenseLedgerTampered.status === 200 && out.chainVerifyExpenseLedgerTampered.body?.valid === false, out.chainVerifyExpenseLedgerTampered.body);
pushCheck('tampered settlement-ledger verify false', out.chainVerifySettlementLedgerTampered.status === 200 && out.chainVerifySettlementLedgerTampered.body?.valid === false, out.chainVerifySettlementLedgerTampered.body);

await db.end();

const allPass = checks.every((c) => c.pass);
console.log(JSON.stringify({ allPass, checks, ids: { groupId, expenseId, settlementId, expenseLedgerId: expenseLedgerRow?.id, settlementLedgerId: settlementLedgerRow?.id } }, null, 2));
