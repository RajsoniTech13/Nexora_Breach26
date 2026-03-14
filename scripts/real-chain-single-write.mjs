const api = 'http://localhost:3000/api/v1';
const rand = Math.random().toString(16).slice(2, 8);

const userA = { email: `real_a_${rand}@test.local`, password: 'Password123!' };
const userB = { email: `real_b_${rand}@test.local`, password: 'Password123!' };

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

const regA = await post(`${api}/auth/register`, userA);
const regB = await post(`${api}/auth/register`, userB);
if (regA.status !== 201 || regB.status !== 201) throw new Error('register failed');

const loginA = await post(`${api}/auth/login`, userA);
const loginB = await post(`${api}/auth/login`, userB);
if (loginA.status !== 200 || loginB.status !== 200) throw new Error('login failed');

const tokenA = loginA.body?.data?.accessToken;
const userBId = loginB.body?.data?.user?.id;

const groupRes = await post(`${api}/groups`, { name: `RealChain ${rand}`, currency: 'INR' }, tokenA);
if (groupRes.status !== 201) throw new Error('group failed');
const groupId = groupRes.body?.data?.group?.id;

const addRes = await post(`${api}/groups/${groupId}/members`, { userId: userBId }, tokenA);
if (addRes.status !== 201) throw new Error('member failed');

const expenseRes = await post(
  `${api}/groups/${groupId}/expenses`,
  {
    amount: 150.25,
    description: 'Real chain tx test',
    splitType: 'equal',
    currency: 'INR',
    category: 'Food',
    expenseDate: '2026-03-14',
    splits: [{ userId: userBId }],
  },
  tokenA,
);

console.log(JSON.stringify({
  createExpenseStatus: expenseRes.status,
  groupId,
  expenseId: expenseRes.body?.data?.expense?.id,
  userEmail: userA.email,
}, null, 2));
