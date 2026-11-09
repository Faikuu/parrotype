import type { LucideIcon } from 'lucide-react';
import { Crown, Flag, GraduationCap, Keyboard, LogIn, Shield, User } from 'lucide-react';
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
          'rounded-full p-1.5 transition-colors hover:text-text sm:p-2',
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
  // Any permission opens the admin panel (docs/SPEC-2.4.md).
  const canAdmin = (user?.permissions.length ?? 0) > 0;
  return (
    <header className="flex items-center justify-between gap-4 pb-6 pt-6">
      <Link to="/" className="flex items-center gap-2.5 text-text no-underline">
        <span className="text-caret">
          <ParrotHead size={22} />
        </span>
        <span className="font-sans text-[1.6rem] font-semibold leading-none">parrotype</span>
      </Link>
      <nav aria-label={t('nav:main')} className="flex items-center gap-0.5 sm:gap-1">
        <NavIcon to="/" end label={t('nav:test')} icon={Keyboard} />
        <NavIcon to="/leaderboard" label={t('nav:leaderboard')} icon={Crown} />
        <NavIcon to="/race" label={t('race:navLabel')} icon={Flag} />
        <NavIcon to="/learn" label={t('learn:navLabel')} icon={GraduationCap} />
        {canAdmin && <NavIcon to="/admin" label={t('admin:navLabel')} icon={Shield} />}
        {user ? (
          <NavIcon to="/account" label={t('nav:account')} icon={User} />
        ) : (
          <NavIcon to="/login" label={t('nav:login')} icon={LogIn} />
        )}
      </nav>
    </header>
  );
}
