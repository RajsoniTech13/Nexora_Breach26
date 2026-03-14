import pg from 'pg';

const api = 'http://localhost:3000/api/v1';
const db = new pg.Pool({ connectionString: 'postgresql://user:password@localhost:5432/nexora' });
const rand = Math.random().toString(16).slice(2, 8);

const u1 = { email: `chain_a_${rand}@test.local`, password: 'Password123!' };
const u2 = { email: `chain_b_${rand}@test.local`, password: 'Password123!' };

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

const login1 = await post(`${api}/auth/login`, u1);
const login2 = await post(`${api}/auth/login`, u2);
out.login1 = login1.status;
out.login2 = login2.status;

const token1 = login1.body?.data?.accessToken;
const user2Id = login2.body?.data?.user?.id;

const g = await post(`${api}/groups`, { name: `Chain Test ${rand}`, currency: 'INR' }, token1);
out.createGroup = g;
const groupId = g.body?.data?.group?.id;

out.addMember = await post(`${api}/groups/${groupId}/members`, { userId: user2Id }, token1);

const exp = await post(
  `${api}/groups/${groupId}/expenses`,
  {
    amount: 250.5,
    description: 'Blockchain integration expense',
    splitType: 'equal',
    currency: 'INR',
    category: 'food',
    expenseDate: '2026-03-14',
    splits: [{ userId: user2Id }],
  },
  token1,
);
out.createExpense = exp;
const expenseId = exp.body?.data?.expense?.id;

const st = await post(`${api}/groups/${groupId}/settlements`, { toUser: user2Id, amount: 100, currency: 'INR' }, token1);
out.createSettlement = st;
const settlementId = st.body?.data?.settlement?.id;

out.markCash = await post(`${api}/groups/${groupId}/payments/mark-cash`, { settlementId }, token1);

await new Promise((r) => setTimeout(r, 1000));

const expenseLedger = await db.query(
  "select le.id from ledger_entries le where le.reference_id=$1 and le.reference_type='expense' order by le.created_at desc limit 1",
  [expenseId],
);
const settlementLedger = await db.query(
  "select le.id from ledger_entries le where le.reference_id=$1 and le.reference_type='settlement' order by le.created_at desc limit 1",
  [settlementId],
);

const expenseLedgerId = expenseLedger.rows[0]?.id;
const settlementLedgerId = settlementLedger.rows[0]?.id;

out.verifyExpense = await post(`${api}/blockchain/verify-expense`, { expenseId }, token1);
out.verifySettlement = await post(`${api}/blockchain/verify-settlement`, { settlementId }, token1);
out.verifyLedgerExpense = await post(`${api}/blockchain/verify-ledger`, { entryId: expenseLedgerId }, token1);
out.verifyLedgerSettlement = await post(`${api}/blockchain/verify-ledger`, { entryId: settlementLedgerId }, token1);

out.ids = { groupId, expenseId, settlementId, expenseLedgerId, settlementLedgerId };

await db.end();
console.log(JSON.stringify(out, null, 2));
