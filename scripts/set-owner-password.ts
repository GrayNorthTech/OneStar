import 'dotenv/config';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { db, getOwnerConfig } from '../server/db.ts';
import { hashPassword } from '../server/password.ts';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeSqlLiteral(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function main() {
  const sqlOnly = process.argv.includes('--sql');
  const owner = getOwnerConfig();
  const rl = readline.createInterface({ input, output });

  try {
    const emailInput = (await rl.question(`Owner email [${owner.email}]: `)).trim().toLowerCase();
    const email = emailInput || owner.email;
    if (!isValidEmail(email)) {
      console.error('Error: Please enter a valid corporate email address.');
      process.exitCode = 1;
      return;
    }

    const password = (await rl.question('New Owner password (min 10 chars): ')).trim();
    if (password.length < 10) {
      console.error('Error: Password must be at least 10 characters.');
      process.exitCode = 1;
      return;
    }

    const hash = hashPassword(password);
    const now = new Date().toISOString();

    if (sqlOnly) {
      const safeEmail = escapeSqlLiteral(email);
      const safeHash = escapeSqlLiteral(hash);
      console.log('\n-- Run this SQL in cPanel phpMyAdmin after importing docs/mysql_schema.sql:\n');
      console.log(
        `UPDATE users\nSET email = '${safeEmail}', password_hash = '${safeHash}', status = 'Active', updated_at = '${now}'\nWHERE id = 'user-founder' OR LOWER(email) = '${safeEmail}';\n`
      );
      return;
    }

    await db.init();
    try {
      const existing =
        (await db.queryOne<any>('SELECT id FROM users WHERE LOWER(email) = ?', [email])) ||
        (await db.queryOne<any>('SELECT id FROM users WHERE id = ?', ['user-founder']));

      if (!existing) {
        await db.execute(
          `INSERT INTO users (
            id, email, full_name, position, department_id, role_id,
            employment_classification, responsibilities, password_hash, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'Founder', 'dept-exec', 'role-owner', 'Founder / Principal',
            'Executive leadership, infrastructure operations, security architecture, and platform administration.',
            ?, 'Active', ?, ?)`,
          ['user-founder', email, owner.name, hash, now, now]
        );
      } else {
        await db.execute(
          'UPDATE users SET email = ?, password_hash = ?, status = ?, updated_at = ? WHERE id = ?',
          [email, hash, 'Active', now, existing.id]
        );
      }

      const status = db.getStatus();
      console.log(`Success: Owner account (${email}) password hash saved in ${status.dialect} (${status.database}).`);
    } finally {
      await db.close();
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
