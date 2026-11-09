import type { MailLanguage } from './locale';

export interface RenderedMail {
  subject: string;
  text: string;
}

/** Plain-text bodies. The link is on its own line so mail clients keep it whole. */
const RESET: Record<MailLanguage, { subject: string; body: (link: string) => string }> = {
  en: {
    subject: 'Reset your ParroType password',
    body: (link) =>
      'Someone asked to reset the password for your ParroType account.\n\n' +
      `Reset it here (the link works for 30 minutes):\n${link}\n\n` +
      "If you didn't ask for this, ignore this email. Your password stays the same.",
  },
  pl: {
    subject: 'Zresetuj hasło do ParroType',
    body: (link) =>
      'Ktoś poprosił o zresetowanie hasła do Twojego konta ParroType.\n\n' +
      `Zresetuj je tutaj (link działa przez 30 minut):\n${link}\n\n` +
      'Jeśli to nie Ty, zignoruj tę wiadomość. Hasło pozostanie bez zmian.',
  },
  de: {
    subject: 'ParroType-Passwort zurücksetzen',
    body: (link) =>
      'Jemand hat angefordert, das Passwort deines ParroType-Kontos zurückzusetzen.\n\n' +
      `Hier kannst du es zurücksetzen (der Link ist 30 Minuten gültig):\n${link}\n\n` +
      'Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt unverändert.',
  },
  es: {
    subject: 'Restablece tu contraseña de ParroType',
    body: (link) =>
      'Alguien ha pedido restablecer la contraseña de tu cuenta de ParroType.\n\n' +
      `Restablécela aquí (el enlace vale 30 minutos):\n${link}\n\n` +
      'Si no lo pediste tú, ignora este correo. Tu contraseña no cambiará.',
  },
};

const VERIFY: Record<MailLanguage, { subject: string; body: (link: string) => string }> = {
  en: {
    subject: 'Verify your ParroType email',
    body: (link) =>
      'Welcome to ParroType. Confirm your email address to appear on the leaderboards:\n' +
      `${link}\n\nThe link works for 24 hours. If you didn't create an account, ignore this email.`,
  },
  pl: {
    subject: 'Potwierdź adres e-mail w ParroType',
    body: (link) =>
      'Witaj w ParroType. Potwierdź swój adres e-mail, aby pojawić się w rankingach:\n' +
      `${link}\n\nLink działa przez 24 godziny. Jeśli nie zakładałeś konta, zignoruj tę wiadomość.`,
  },
  de: {
    subject: 'Bestätige deine E-Mail-Adresse bei ParroType',
    body: (link) =>
      'Willkommen bei ParroType. Bestätige deine E-Mail-Adresse, um in den Bestenlisten zu erscheinen:\n' +
      `${link}\n\nDer Link ist 24 Stunden gültig. Wenn du kein Konto angelegt hast, ignoriere diese E-Mail.`,
  },
  es: {
    subject: 'Verifica tu correo de ParroType',
    body: (link) =>
      'Bienvenido a ParroType. Confirma tu dirección de correo para aparecer en las clasificaciones:\n' +
      `${link}\n\nEl enlace vale 24 horas. Si no creaste una cuenta, ignora este correo.`,
  },
};

export function renderResetMail(lang: MailLanguage, link: string): RenderedMail {
  const t = RESET[lang];
  return { subject: t.subject, text: t.body(link) };
}

export function renderVerifyMail(lang: MailLanguage, link: string): RenderedMail {
  const t = VERIFY[lang];
  return { subject: t.subject, text: t.body(link) };
}

/** Sent when two-factor sign-in locks after repeated wrong codes. No link: nothing to click. */
const LOCKOUT: Record<MailLanguage, { subject: string; body: string }> = {
  en: {
    subject: 'Two-factor sign-in was locked on your ParroType account',
    body:
      'Someone entered your password and several wrong two-factor codes. If this wasn\'t you, change your password.\n\n' +
      'Two-factor sign-in is locked for 15 minutes.',
  },
  pl: {
    subject: 'Logowanie dwuetapowe zostało zablokowane na Twoim koncie ParroType',
    body:
      'Ktoś wpisał Twoje hasło i kilka błędnych kodów dwuetapowych. Jeśli to nie Ty, zmień hasło.\n\n' +
      'Logowanie dwuetapowe jest zablokowane na 15 minut.',
  },
  de: {
    subject: 'Zwei-Faktor-Anmeldung bei deinem ParroType-Konto gesperrt',
    body:
      'Jemand hat dein Passwort und mehrere falsche Codes der Zwei-Faktor-Anmeldung eingegeben. Wenn du das nicht warst, ändere dein Passwort.\n\n' +
      'Die Zwei-Faktor-Anmeldung ist für 15 Minuten gesperrt.',
  },
  es: {
    subject: 'La verificación en dos pasos se bloqueó en tu cuenta de ParroType',
    body:
      'Alguien ha introducido tu contraseña y varios códigos de verificación en dos pasos incorrectos. Si no has sido tú, cambia tu contraseña.\n\n' +
      'La verificación en dos pasos está bloqueada durante 15 minutos.',
  },
};

export function renderLockoutMail(lang: MailLanguage): RenderedMail {
  const t = LOCKOUT[lang];
  return { subject: t.subject, text: t.body };
}
