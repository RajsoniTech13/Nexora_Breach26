const api = 'http://localhost:3000/api/v1';
const rand = Math.random().toString(16).slice(2, 8);

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

const user = { email: `single_real_${rand}@test.local`, password: 'Password123!' };
const reg = await post(`${api}/auth/register`, user);
if (reg.status !== 201) throw new Error('register failed');

const login = await post(`${api}/auth/login`, user);
if (login.status !== 200) throw new Error('login failed');

const token = login.body?.data?.accessToken;
const userId = login.body?.data?.user?.id;

const groupRes = await post(`${api}/groups`, { name: `Single Real ${rand}`, currency: 'INR' }, token);
if (groupRes.status !== 201) throw new Error('group failed');
const groupId = groupRes.body?.data?.group?.id;

const expenseRes = await post(
  `${api}/groups/${groupId}/expenses`,
  {
    amount: 111.11,
    description: 'Single-chain write',
    splitType: 'custom',
    currency: 'INR',
    category: 'Food',
    expenseDate: '2026-03-14',
    paidBy: userId,
    splits: [{ userId, owedAmount: 111.11 }],
  },
  token,
);

await new Promise((r) => setTimeout(r, 1500));

const verify = await post(`${api}/blockchain/verify-expense`, { expenseId: expenseRes.body?.data?.expense?.id }, token);

console.log(JSON.stringify({
  createExpenseStatus: expenseRes.status,
  expenseId: expenseRes.body?.data?.expense?.id,
  verifyStatus: verify.status,
  verifyValid: verify.body?.data?.blockchain?.valid,
}, null, 2));
