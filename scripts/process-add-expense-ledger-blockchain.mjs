import pg from 'pg';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
const DB_URL = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/nexora';

const db = new pg.Pool({ connectionString: DB_URL });
const randomSuffix = Math.random().toString(16).slice(2, 8);

const userA = { email: `process_a_${randomSuffix}@test.local`, password: 'Password123!' };
const userB = { email: `process_b_${randomSuffix}@test.local`, password: 'Password123!' };

async function post(url, body, token) {
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
}

function assertStatus(step, response, expected) {
  if (response.status !== expected) {
    const message = response?.body?.message || response?.body?.error || 'Unexpected response';
    throw new Error(`${step} failed: expected ${expected}, got ${response.status}. ${message}`);
  }
}

async function run() {
  try {
    // 1) Register + login both users so we can create group and members with auth headers.
    const regA = await post(`${API_BASE}/auth/register`, userA);
    const regB = await post(`${API_BASE}/auth/register`, userB);
    assertStatus('register user A', regA, 201);
    assertStatus('register user B', regB, 201);

    const loginA = await post(`${API_BASE}/auth/login`, userA);
    const loginB = await post(`${API_BASE}/auth/login`, userB);
    assertStatus('login user A', loginA, 200);
    assertStatus('login user B', loginB, 200);

    const accessToken = loginA.body?.data?.accessToken;
    const userBId = loginB.body?.data?.user?.id;

    if (!accessToken || !userBId) {
      throw new Error('Failed to extract access token or second user id from login responses');
    }

    // 2) Create group and add member.
    const groupRes = await post(
      `${API_BASE}/groups`,
      { name: `Process Chain ${randomSuffix}`, currency: 'INR' },
      accessToken,
    );
    assertStatus('create group', groupRes, 201);

    const groupId = groupRes.body?.data?.group?.id;
    if (!groupId) {
      throw new Error('Group ID missing after create group');
    }

    const addMemberRes = await post(
      `${API_BASE}/groups/${groupId}/members`,
      { userId: userBId },
      accessToken,
    );
    assertStatus('add member', addMemberRes, 201);

    // 3) Add expense.
    // This route already creates corresponding ledger entries and triggers blockchain anchoring.
    const expenseRes = await post(
      `${API_BASE}/groups/${groupId}/expenses`,
      {
        amount: 321.45,
        description: 'Process expense blockchain test',
        splitType: 'equal',
        currency: 'INR',
        category: 'ops',
        expenseDate: '2026-03-14',
        splits: [{ userId: userBId }],
      },
      accessToken,
    );
    assertStatus('create expense', expenseRes, 201);

    const expenseId = expenseRes.body?.data?.expense?.id;
    if (!expenseId) {
      throw new Error('Expense ID missing after create expense');
    }

    // 4) Load latest expense ledger entry from DB and verify both expense and ledger on blockchain.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const ledgerResult = await db.query(
      "SELECT le.id FROM ledger_entries le WHERE le.reference_id = $1 AND le.reference_type = 'expense' ORDER BY le.created_at DESC LIMIT 1",
      [expenseId],
    );

    const ledgerEntryId = ledgerResult.rows[0]?.id;
    if (!ledgerEntryId) {
      throw new Error('No expense ledger entry found in DB for created expense');
    }

    const verifyExpenseRes = await post(`${API_BASE}/blockchain/verify-expense`, { expenseId }, accessToken);
    const verifyLedgerRes = await post(`${API_BASE}/blockchain/verify-ledger`, { entryId: ledgerEntryId }, accessToken);

    assertStatus('verify expense', verifyExpenseRes, 200);
    assertStatus('verify ledger', verifyLedgerRes, 200);

    const expenseValid = verifyExpenseRes.body?.data?.blockchain?.valid === true;
    const ledgerValid = verifyLedgerRes.body?.data?.blockchain?.valid === true;

    if (!expenseValid || !ledgerValid) {
      throw new Error(
        `Blockchain verification failed: expenseValid=${String(expenseValid)}, ledgerValid=${String(ledgerValid)}`,
      );
    }

    const output = {
      success: true,
      flow: 'add-expense -> auto-ledger -> blockchain anchor -> verify true',
      ids: {
        groupId,
        expenseId,
        ledgerEntryId,
      },
      verification: {
        expenseValid,
        ledgerValid,
      },
      curlExamples: {
        login: `curl -X POST ${API_BASE}/auth/login -H \"Content-Type: application/json\" -d '{\"email\":\"${userA.email}\",\"password\":\"${userA.password}\"}'`,
        verifyExpense: `curl -X POST ${API_BASE}/blockchain/verify-expense -H \"Authorization: Bearer <ACCESS_TOKEN>\" -H \"Content-Type: application/json\" -d '{\"expenseId\":\"${expenseId}\"}'`,
        verifyLedger: `curl -X POST ${API_BASE}/blockchain/verify-ledger -H \"Authorization: Bearer <ACCESS_TOKEN>\" -H \"Content-Type: application/json\" -d '{\"entryId\":\"${ledgerEntryId}\"}'`,
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await db.end();
  }
}

run().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
  process.exit(1);
});
