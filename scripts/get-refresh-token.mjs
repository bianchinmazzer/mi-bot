import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import open from 'open';
import { config } from 'dotenv';
config({ path: '.env.local' });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3456/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env.local');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:3456`);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('No code received');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h2>✅ Listo</h2>
          <p>Volvé a la terminal, copiá el refresh token y pegalo en .env.local</p>
        </body>
      </html>
    `);

    console.log('\n========================================');
    console.log('✅ REFRESH TOKEN OBTENIDO');
    console.log('========================================\n');
    console.log('Pegá esto en tu .env.local:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('========================================\n');

    if (!tokens.refresh_token) {
      console.warn('⚠️  No vino refresh_token. Revocá el acceso en https://myaccount.google.com/permissions y volvé a correr el script.');
    }

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500);
    res.end('Error');
    process.exit(1);
  }
});

server.listen(3456, () => {
  console.log('\n🔑 Servidor temporal escuchando en http://localhost:3456');
  console.log('🌐 Abriendo navegador para autorizar...\n');
  open(authUrl);
});