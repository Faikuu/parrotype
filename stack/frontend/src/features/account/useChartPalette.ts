import { useEffect, useState } from 'react';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { readChartPalette, type ChartPalette } from './chartColors';

/**
 * The theme colours for a canvas chart, re-read when the theme or the theme preview changes.
 * Theme vars are written after this component's effects, so the read happens a frame later.
 */
export function useChartPalette(): ChartPalette {
  const theme = useSettings((s) => s.theme);
  const preview = useUi((s) => s.previewTheme);
  const [palette, setPalette] = useState<ChartPalette>(readChartPalette);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readChartPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme, preview]);
  return palette;
}
