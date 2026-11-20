import fs from 'node:fs';

const API = 'https://discord.com/api/v10';

export async function sendDm({ token, userId, filepath, filename }) {
  const dmRes = await fetch(`${API}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dmRes.ok) {
    const t = await dmRes.text();
    throw new Error(`open dm ${dmRes.status}: ${t.slice(0, 200)}`);
  }
  const dm = await dmRes.json();

  const file = fs.readFileSync(filepath);
  const form = new FormData();
  form.append(
    'files[0]',
    new Blob([file], { type: 'image/gif' }),
    filename
  );
  form.append(
    'payload_json',
    JSON.stringify({
      content: '🎞️ Ton GIF depuis GIF Studio',
      attachments: [
        { id: 0, filename, description: 'Généré avec GIF Studio' },
      ],
    })
  );

  const sendRes = await fetch(`${API}/channels/${dm.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}` },
    body: form,
  });
  if (!sendRes.ok) {
    const t = await sendRes.text();
    throw new Error(`send msg ${sendRes.status}: ${t.slice(0, 200)}`);
  }
  return true;
}
