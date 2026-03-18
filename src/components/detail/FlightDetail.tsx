import type { FlightEntity } from '@/types/entities';
import { useFlightStore } from '@/stores/flightStore';
import { DetailValue } from './DetailValue';

// Unit conversion constants
const MS_TO_KNOTS = 1.94384;
const M_TO_FT = 3.28084;
const MS_TO_FTMIN = 196.85;

const SOURCE_LABELS: Record<string, string> = {
  opensky: 'OpenSky',
  adsb: 'ADS-B Exchange',
  adsblol: 'adsb.lol',
};

interface FlightDetailProps {
  entity: FlightEntity;
}

export function FlightDetail({ entity }: FlightDetailProps) {
  const activeSource = useFlightStore((s) => s.activeSource);
  const d = entity.data;

  const speed = d.velocity != null
    ? `${(d.velocity * MS_TO_KNOTS).toFixed(1)} kn / ${d.velocity.toFixed(1)} m/s`
    : '--';

  const altitude = d.altitude != null
    ? `${Math.round(d.altitude * M_TO_FT)} ft / ${Math.round(d.altitude)} m`
    : '--';

  const verticalRate = d.verticalRate != null
    ? `${(d.verticalRate * MS_TO_FTMIN).toFixed(0)} ft/min / ${d.verticalRate.toFixed(1)} m/s`
    : '--';

  const heading = d.heading != null ? `${Math.round(d.heading)}\u00B0` : '--';

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Identity
      </h3>
      <DetailValue label="Callsign" value={d.callsign || 'N/A'} />
      <DetailValue label="ICAO24" value={d.icao24} />
      <DetailValue label="Origin" value={d.originCountry || '--'} />
      <DetailValue label="Status" value={d.onGround ? 'Ground' : 'Airborne'} />
      {d.unidentified && (
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Unidentified
          </span>
          <span className="text-red-500 font-semibold">YES</span>
        </div>
      )}

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Position
      </h3>
      <DetailValue label="Latitude" value={entity.lat.toFixed(6)} />
      <DetailValue label="Longitude" value={entity.lng.toFixed(6)} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Movement
      </h3>
      <DetailValue label="Speed" value={speed} />
      <DetailValue label="Heading" value={heading} />
      <DetailValue label="Altitude" value={altitude} />
      <DetailValue label="V/Rate" value={verticalRate} />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Source
      </h3>
      <DetailValue label="Data Source" value={SOURCE_LABELS[activeSource] ?? activeSource} />
    </div>
  );
}
