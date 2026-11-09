import type { LucideIcon } from 'lucide-react';
import { Crown, Flag, Keyboard, LogIn, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';
import { cn } from './cn';
import { ParrotHead } from './ParrotHead';

function NavIcon({ to, end, label, icon: Icon }: { to: string; end?: boolean; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(
          'rounded-full p-2 transition-colors hover:text-text',
          isActive ? 'text-main' : 'text-sub',
        )
      }
    >
      <Icon size={20} aria-hidden="true" />
    </NavLink>
  );
}

export function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <header className="flex items-center justify-between gap-4 pb-6 pt-6">
      <Link to="/" className="flex items-center gap-2.5 text-text no-underline">
        <span className="text-caret">
          <ParrotHead size={22} />
        </span>
        <span className="font-sans text-[1.6rem] font-semibold leading-none">parrotype</span>
      </Link>
      <nav aria-label={t('nav:main')} className="flex items-center gap-1">
        <NavIcon to="/" end label={t('nav:test')} icon={Keyboard} />
        <NavIcon to="/leaderboard" label={t('nav:leaderboard')} icon={Crown} />
        <NavIcon to="/race" label={t('race:navLabel')} icon={Flag} />
        {user ? (
          <NavIcon to="/account" label={t('nav:account')} icon={User} />
        ) : (
          <NavIcon to="/login" label={t('nav:login')} icon={LogIn} />
        )}
      </nav>
    </header>
  );
}
