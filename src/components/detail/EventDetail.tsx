import type { ConflictEventEntity } from '@/types/entities';
import { DetailValue } from './DetailValue';

interface EventDetailProps {
  entity: ConflictEventEntity;
}

export function EventDetail({ entity }: EventDetailProps) {
  const d = entity.data;
  const date = new Date(entity.timestamp).toISOString().slice(0, 10);
  const typeLabel = entity.type === 'drone' ? 'Drone' : 'Missile';

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Event
      </h3>
      <DetailValue label="Type" value={typeLabel} />
      <DetailValue label="Event Type" value={d.eventType || '--'} />
      <DetailValue label="Sub-Type" value={d.subEventType || '--'} />
      <DetailValue label="CAMEO Code" value={d.cameoCode || '--'} />
      <DetailValue label="Goldstein" value={d.goldsteinScale.toFixed(1)} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Location
      </h3>
      <DetailValue label="Location" value={d.locationName || '--'} />
      <DetailValue label="Latitude" value={entity.lat.toFixed(6)} />
      <DetailValue label="Longitude" value={entity.lng.toFixed(6)} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Actors
      </h3>
      <DetailValue label="Actor 1" value={d.actor1 || '--'} />
      <DetailValue label="Actor 2" value={d.actor2 || '--'} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Source
      </h3>
      <DetailValue label="Data Source" value="GDELT v2" />
      <DetailValue label="Date" value={date} />
      {d.source && (
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Source Link
          </span>
          <a
            href={d.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs underline"
          >
            View source
          </a>
        </div>
      )}
    </div>
  );
}
