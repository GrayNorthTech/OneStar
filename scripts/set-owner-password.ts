import 'dotenv/config';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { db } from '../server/db.ts';
import { hashPassword } from '../server/security.ts';

async function main() {
  await db.init();
  const rl = readline.createInterface({ input, output });
  try {
    const email = (await rl.question('Owner email [dylan@kortrix.com]: ')).trim().toLowerCase() || 'dylan@kortrix.com';
    const password = (await rl.question('New Owner password (min 10 chars): ')).trim();
    if (password.length < 10) {
      console.error('Error: Password must be at least 10 characters.');
      process.exitCode = 1;
      return;
    }
    const existing = await db.queryOne<any>('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (!existing) {
      console.error(`Error: User ${email} was not found in the database.`);
      process.exitCode = 1;
      return;
    }
    const hash = hashPassword(password);
    await db.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      hash,
      new Date().toISOString(),
      existing.id,
    ]);
    console.log(`Success: Password hash updated for ${email} in ${db.getStatus().dialect} (${db.getStatus().database}).`);
  } finally {
    rl.close();
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
