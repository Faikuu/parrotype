import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { cn } from '@/components/cn';
import { activeSection, SECTIONS } from '../catalog';
import { usePermissions } from '../usePermissions';

/** Only the sections the user can open. A sidebar from 768px up, a select below. */
export function AdminNav() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = SECTIONS.filter((s) => can(s.perm));
  const current = activeSection(pathname, visible);

  return (
    <>
      <nav aria-label={t('admin:nav.label')} className="hidden w-52 shrink-0 md:block">
        <ul className="flex flex-col gap-0.5">
          {visible.map((s) => (
            <li key={s.id}>
              <NavLink
                to={s.path}
                end={s.path === '/admin'}
                className={({ isActive }) =>
                  cn(
                    'block rounded-[6px] px-3 py-1.5 text-[0.95rem] transition-colors',
                    isActive ? 'bg-surface text-main' : 'text-sub hover:text-text',
                  )
                }
              >
                {t(`admin:nav.${s.id}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="md:hidden">
        <label htmlFor="admin-section-select" className="sr-only">
          {t('admin:nav.select')}
        </label>
        <select
          id="admin-section-select"
          value={current?.path ?? ''}
          onChange={(e) => navigate(e.target.value)}
          className="h-10 w-full rounded-[6px] bg-surface px-3 text-[0.95rem] text-text outline-none"
        >
          {!current && <option value="" disabled>{t('admin:nav.select')}</option>}
          {visible.map((s) => (
            <option key={s.id} value={s.path}>
              {t(`admin:nav.${s.id}`)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
