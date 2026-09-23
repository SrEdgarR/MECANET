import crypto from 'node:crypto';

const STANDARD_ADMIN_EMAIL = 'admin@mecanet.com';
const EMAIL_PATTERN = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

export function askHidden(rl, prompt) {
  const { input, output } = rl;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return new Promise((resolve) => rl.question(prompt, resolve));
  }

  output.write(prompt);
  const wasRaw = input.isRaw;

  return new Promise((resolve, reject) => {
    let password = '';
    let finished = false;

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      output.write('\n');
    };

    const finish = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve(password);
    };

    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (finished) break;
        if (character === '\u0003') {
          finish(new Error('Entrada cancelada.'));
        } else if (character === '\r' || character === '\n') {
          finish();
        } else if (character === '\u007f' || character === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            output.write('\b \b');
          }
        } else if (character >= ' ') {
          password += character;
          output.write('*');
        }
      }
    };

    input.setRawMode(true);
    input.on('data', onData);
    input.resume();
  });
}

export async function promptAdminCredentials(rl) {
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));
  console.log('\nElige cómo crear las credenciales del administrador:');
  console.log(`  1. Correo estándar (${STANDARD_ADMIN_EMAIL}) y contraseña aleatoria segura`);
  console.log('  2. Correo personalizado y contraseña personalizada');
  console.log('  3. Correo personalizado y contraseña aleatoria segura');

  let option;
  while (!['1', '2', '3'].includes(option)) {
    option = (await question('Opción (1/2/3): ')).trim();
    if (!['1', '2', '3'].includes(option)) console.log('Elige 1, 2 o 3.');
  }

  let email = STANDARD_ADMIN_EMAIL;
  if (option !== '1') {
    do {
      email = (await question('Correo del administrador: ')).trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) console.log('Escribe un correo válido.');
    } while (!EMAIL_PATTERN.test(email));
  }

  if (option === '2') {
    let password;
    let confirmation;
    do {
      password = await askHidden(rl, `Contraseña personalizada (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `);
      if (password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
        console.log(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres y no superar ${MAX_PASSWORD_BYTES} bytes.`);
        continue;
      }
      confirmation = await askHidden(rl, 'Confirma la contraseña: ');
      if (password !== confirmation) console.log('Las contraseñas no coinciden. Inténtalo de nuevo.');
    } while (password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES || password !== confirmation);

    return { email, password, generated: false };
  }

  return { email, password: crypto.randomBytes(32).toString('hex'), generated: true };
}

export async function createAdminUser(User, { name, email, password }) {
  const existingUser = await User.exists({ email });
  if (existingUser) {
    throw new Error(`Ya existe un usuario con el correo ${email}. No se modificó ningún usuario.`);
  }

  try {
    return await User.create({ name, email, password, role: 'admin', isActive: true });
  } catch (error) {
    if (error?.code === 11000) {
      throw new Error(`Ya existe un usuario con el correo ${email}. No se modificó ningún usuario.`);
    }
    throw error;
  }
}

export function printGeneratedPassword(credentials) {
  if (!credentials.generated) return;
  console.log('\nGuarda esta contraseña; no volverá a mostrarse:');
  console.log(credentials.password);
}
