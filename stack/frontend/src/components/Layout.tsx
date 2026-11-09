import { Outlet } from 'react-router';
import { CommandLine } from '@/features/commandline/CommandLine';
import { CustomTextModal } from '@/features/commandline/CustomTextModal';
import { useCommandLineShortcuts } from '@/features/commandline/useCommandLine';
import { ThemeEditor } from '@/themes/ThemeEditor';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { cn } from './cn';
import { Footer } from './Footer';
import { Header } from './Header';

export function Layout() {
  const isTyping = useUi((s) => s.isTyping);
  const focusMode = useSettings((s) => s.focusMode);
  const chromeHidden = isTyping && focusMode;
  useCommandLineShortcuts();

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-[1080px] px-4">
        <div
          className={cn(
            'transition-opacity duration-300',
            chromeHidden && 'pointer-events-none opacity-0',
          )}
        >
          <Header />
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4">
        <Outlet />
      </main>
      <div className="mx-auto w-full max-w-[1080px] px-4">
        <div
          className={cn(
            'transition-opacity duration-300',
            chromeHidden && 'pointer-events-none opacity-0',
          )}
        >
          <Footer />
        </div>
      </div>
      <CommandLine />
      <CustomTextModal />
      <ThemeEditor />
    </div>
  );
}
