import type { ShipEntity } from '@/types/entities';
import { DetailValue } from './DetailValue';

interface ShipDetailProps {
  entity: ShipEntity;
}

export function ShipDetail({ entity }: ShipDetailProps) {
  const d = entity.data;

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Identity
      </h3>
      <DetailValue label="Name" value={d.shipName || 'Unknown'} />
      <DetailValue label="MMSI" value={String(d.mmsi)} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Position
      </h3>
      <DetailValue label="Latitude" value={entity.lat.toFixed(6)} />
      <DetailValue label="Longitude" value={entity.lng.toFixed(6)} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Movement
      </h3>
      <DetailValue label="Speed" value={`${d.speedOverGround.toFixed(1)} kn`} />
      <DetailValue label="Course" value={`${Math.round(d.courseOverGround)}\u00B0`} />
      <DetailValue label="Heading" value={`${Math.round(d.trueHeading)}\u00B0`} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Source
      </h3>
      <DetailValue label="Data Source" value="AISStream" />
    </div>
  );
}
