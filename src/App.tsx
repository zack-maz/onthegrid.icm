import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { AppShell } from '@/components/layout/AppShell';

function App() {
  return (
    <>
      <AppShell />
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default App;
