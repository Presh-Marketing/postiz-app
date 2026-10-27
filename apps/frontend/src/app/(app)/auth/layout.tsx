export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <MantineWrapper>
    <Toaster /><ReturnUrlComponent />
    <main className="preshos-auth min-h-screen w-full flex items-center justify-center p-6 text-white">
      <section className="preshos-auth-panel w-full max-w-[480px] rounded-xl p-8 flex flex-col gap-8">
        <LogoTextComponent />
        <p>Plan and publish social content with your PRESHos workspace.</p>
        <div className="flex">{children}</div>
      </section>
    </main>
  </MantineWrapper>;
}
