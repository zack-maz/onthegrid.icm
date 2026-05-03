import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { useMapStore } from '@/stores/mapStore';

export function CoordinateReadout() {
  const cursorLng = useMapStore((s) => s.cursorLng);
  const cursorLat = useMapStore((s) => s.cursorLat);

  const latLabel = cursorLat >= 0 ? 'N' : 'S';
  const lngLabel = cursorLng >= 0 ? 'E' : 'W';

  return (
    <OverlayPanel className="text-xs font-mono text-text-secondary">
      {Math.abs(cursorLat).toFixed(4)}
      {latLabel}, {Math.abs(cursorLng).toFixed(4)}
      {lngLabel}
    </OverlayPanel>
  );
}
