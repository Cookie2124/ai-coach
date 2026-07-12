const base = 'http://localhost:3001/api';

async function login() {
  for (const path of ['/auth/login', '/auth/register']) {
    const body = path.includes('register')
      ? { email: 'test@aicoach.local', password: 'test123456', name: 'Test User' }
      : { email: 'test@aicoach.local', password: 'test123456' };
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
  }
  throw new Error('Auth failed');
}

const { token } = await login();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const config = await fetch(base + '/ai/config', { headers }).then(r => r.json());
console.log('AI config:', config);

const test = await fetch(base + '/ai/test', { method: 'POST', headers }).then(r => r.json());
console.log('AI test:', test);

const chat = await fetch(base + '/ai/chat', {
  method: 'POST',
  headers,
  body: JSON.stringify({ message: 'How is my recovery today? One sentence.' }),
}).then(r => r.json());
console.log('Chat source:', chat.source, 'model:', chat.model);
console.log('Chat error:', chat.error);
console.log('Response preview:', String(chat.response).slice(0, 200));
