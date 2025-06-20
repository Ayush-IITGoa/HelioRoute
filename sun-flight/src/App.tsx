import { useState, useEffect } from 'react'
import { getInitialBearing, interpolateSunAlongRoute } from './sunUtils'
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Marker, Popup, Polyline as RLPolyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import airports from './airports.json'
import { DateTime } from 'luxon'
// @ts-ignore
import SunCalc from 'suncalc'
import { FaPlaneDeparture, FaPlaneArrival, FaCalendarAlt, FaClock, FaQrcode, FaStar, FaTrash, FaSun } from 'react-icons/fa';
import Select, { components, type MenuListProps } from 'react-select';
import { FixedSizeList as List } from 'react-window';

interface AirportOption {
  value: string;
  label: string;
}

const airportOptions: AirportOption[] = airports.map(airport => ({
  value: airport.iata,
  label: `${airport.name} (${airport.iata}) - ${airport.city}`
}));

const customSelectStyles = {
  control: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: '0.5rem',
    border: state.isFocused ? '2px solid #f59e0b' : '2px solid transparent',
    boxShadow: 'none',
    '&:hover': {
      borderColor: '#f59e0b'
    }
  }),
  menu: (provided: any) => ({
    ...provided,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    backdropFilter: 'blur(10px)',
    borderRadius: '0.5rem',
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#f59e0b' : state.isFocused ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
    color: state.isSelected ? '#1e293b' : '#d1d5db',
    '&:active': {
      backgroundColor: 'rgba(251, 191, 36, 0.3)'
    }
  }),
  singleValue: (provided: any) => ({
    ...provided,
    color: '#d1d5db',
  }),
  input: (provided: any) => ({
    ...provided,
    color: '#d1d5db'
  })
};

const MenuList = (props: MenuListProps<AirportOption>) => {
  const { options, children, maxHeight, getValue } = props;
  const [value] = getValue();
  const initialOffset = Array.isArray(options) ? options.indexOf(value) * 35 : 0;

  return (
    <List
      width="100%"
      height={maxHeight}
      itemCount={Array.isArray(children) ? children.length : 0}
      itemSize={35}
      initialScrollOffset={initialOffset}
    >
      {({ index, style }) => <div style={style}>{Array.isArray(children) ? children[index] : null}</div>}
    </List>
  );
};

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    if(bounds) map.fitBounds(bounds, {padding: [50, 50]});
  }, [bounds, map])
  return null
}

function isDSTChange(dt: DateTime) {
  // Returns true if this date is a DST changeover (offset changes that day)
  const startOfDay = dt.startOf('day');
  const endOfDay = dt.endOf('day');
  return startOfDay.offset !== endOfDay.offset;
}

// Calculate subsolar point (where the sun is directly overhead)
function getSubsolarPoint(date: Date) {
  // Sun declination
  const rad = Math.PI / 180;
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const N1 = Math.floor(275 * month / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = (1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3));
  const N = N1 - (N2 * N3) + day - 30;
  const decl = 23.44 * Math.sin(rad * ((360 / 365) * (N - 81)));
  // Subsolar longitude
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const lon = 180 - (minutes / 4); // 180 at 0:00 UTC, -180 at 24:00 UTC
  return { lat: decl, lon };
}

// Calculate day/night terminator as a polyline
function getTerminatorPolyline(date: Date) {
  const points: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const sun = SunCalc.getPosition(date, 0, lon);
    const decl = sun.declination * 180 / Math.PI;
    if (Number.isFinite(decl)) {
      points.push([decl, lon]);
    }
  }
  return points;
}

function App() {
  const [sourceIATA, setSourceIATA] = useState('JFK')
  const [destIATA, setDestIATA] = useState('LAX')
  const [departure, setDeparture] = useState('2024-07-22T08:00')
  const [flightTime, setFlightTime] = useState('5.5')

  const [sourceAirport, setSourceAirport] = useState<any>(airports.find(a => a.iata === 'JFK'))
  const [destAirport, setDestAirport] = useState<any>(airports.find(a => a.iata === 'LAX'))
  
  const [recommendation, setRecommendation] = useState('')
  const [flightPath, setFlightPath] = useState<[number, number][]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [depTime, setDepTime] = useState<DateTime | null>(null)
  const [arrivalTime, setArrivalTime] = useState<DateTime | null>(null)
  const [dstWarning, setDstWarning] = useState<string | null>(null)
  const [sunSummary, setSunSummary] = useState<string>('')
  const [details, setDetails] = useState<string>('')
  const [sunEvents, setSunEvents] = useState<Array<{ type: 'sunrise' | 'sunset'; time: Date; lat: number; lon: number }>>([])
  const [mapTime, setMapTime] = useState<Date>(() => new Date());
  const [darkMode, setDarkMode] = useState(true);
  const [favorites, setFavorites] = useState<Array<{ source: string, dest: string }>>([]);

  const isCurrentFavorite = favorites.some(
    fav => fav.source === sourceIATA && fav.dest === destIATA
  );

  // Load favorites from localStorage on initial render
  useEffect(() => {
    const savedFavorites = localStorage.getItem('sunFlightFavorites');
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('sunFlightFavorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = () => {
    if (isCurrentFavorite) {
      removeFavorite(sourceIATA, destIATA);
    } else {
      const newFavorite = { source: sourceIATA, dest: destIATA };
      if (!favorites.some(fav => fav.source === newFavorite.source && fav.dest === newFavorite.dest)) {
        setFavorites([...favorites, newFavorite]);
      }
    }
  };

  const removeFavorite = (source: string, dest: string) => {
    setFavorites(favorites.filter(fav => fav.source !== source || fav.dest !== dest));
  };

  const loadFavorite = (source: string, dest: string) => {
    setSourceIATA(source);
    setDestIATA(dest);
    // Optionally, trigger a new calculation automatically
    // handleSubmit(new Event('submit') as any); 
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setRecommendation('')
    setFlightPath([])
    setDepTime(null)
    setArrivalTime(null)
    setDstWarning(null)
    setSunSummary('')
    setDetails('')
    setSunEvents([])
    setLoading(true)

    const foundSource = airports.find(a => a.iata === sourceIATA.toUpperCase());
    const foundDest = airports.find(a => a.iata === destIATA.toUpperCase());

    setSourceAirport(foundSource);
    setDestAirport(foundDest);

    if (!foundSource || !foundDest) {
        setError("Invalid IATA code. Please select a valid airport from the list.");
        setLoading(false);
        return;
    }

    try {
      const depDT = DateTime.fromISO(departure, { zone: foundSource.timezone })
      if (!depDT.isValid) throw new Error('Invalid departure time.')
      const arrDT = depDT.plus({ hours: Number(flightTime) }).setZone(foundDest.timezone)
      setDepTime(depDT)
      setArrivalTime(arrDT)
      
      let warning = ''
      if (isDSTChange(depDT)) warning += `Warning: Departure day is a DST changeover in ${foundSource.city}.\n`
      if (isDSTChange(arrDT)) warning += `Warning: Arrival day is a DST changeover in ${foundDest.city}.`
      setDstWarning(warning || null)
      
      const src = { lat: foundSource.lat, lon: foundSource.lon }
      const dst = { lat: foundDest.lat, lon: foundDest.lon }
      setFlightPath([[src.lat, src.lon], [dst.lat, dst.lon]])

      const intervalMin = 10;
      const sunPoints = interpolateSunAlongRoute(
        src.lat, src.lon, dst.lat, dst.lon,
        depDT.toUTC().toJSDate(), Number(flightTime), intervalMin
      );
      
      let events: Array<{ type: 'sunrise' | 'sunset'; time: Date; lat: number; lon: number }> = [];
      let prevAlt = null;
      for (let i = 0; i < sunPoints.length; i++) {
        const p = sunPoints[i];
        const times = SunCalc.getTimes(p.time, p.lat, p.lon);
        if (prevAlt !== null && prevAlt < 0 && p.altitude >= 0) {
          let eventTime = times.sunrise;
          if (!(eventTime && eventTime >= sunPoints[i-1].time && eventTime <= p.time)) {
            const frac = -prevAlt / (p.altitude - prevAlt);
            eventTime = new Date(sunPoints[i-1].time.getTime() + frac * (p.time.getTime() - sunPoints[i-1].time.getTime()));
          }
          events.push({ type: 'sunrise', time: eventTime, lat: p.lat, lon: p.lon });
        }
        if (prevAlt !== null && prevAlt >= 0 && p.altitude < 0) {
          let eventTime = times.sunset;
          if (!(eventTime && eventTime >= sunPoints[i-1].time && eventTime <= p.time)) {
            const frac = prevAlt / (prevAlt - p.altitude);
            eventTime = new Date(sunPoints[i-1].time.getTime() + frac * (p.time.getTime() - sunPoints[i-1].time.getTime()));
          }
          events.push({ type: 'sunset', time: eventTime, lat: p.lat, lon: p.lon });
        }
        prevAlt = p.altitude;
      }
      setSunEvents(events);

      let leftCount = 0, rightCount = 0, aheadCount = 0, behindCount = 0, sunVisible = false, sunIntervals = 0;
      for (let i = 0; i < sunPoints.length - 1; i++) {
        const p1 = sunPoints[i];
        const p2 = sunPoints[i + 1];
        const heading = getInitialBearing(p1.lat, p1.lon, p2.lat, p2.lon);
        const relAngle = (p1.azimuth - heading + 360) % 360;
        if (p1.altitude < 0) {
        } else {
          sunVisible = true;
          sunIntervals++;
          if (relAngle > 45 && relAngle <= 135) rightCount++;
          else if (relAngle > 225 && relAngle <= 315) leftCount++;
          else if (relAngle > 315 || relAngle <= 45) aheadCount++;
          else if (relAngle > 135 && relAngle <= 225) behindCount++;
        }
      }

      let seat = '';
      let summary = '';
      const totalIntervals = sunPoints.length - 1;
      if (!sunVisible) {
        seat = 'Neither (Sun not visible during flight)';
        summary = 'The sun is below the horizon for the entire flight.';
      } else {
        const percentVisible = ((sunIntervals / totalIntervals) * 100).toFixed(0);
        const leftPercent = sunIntervals ? ((leftCount / sunIntervals) * 100).toFixed(0) : '0';
        const rightPercent = sunIntervals ? ((rightCount / sunIntervals) * 100).toFixed(0) : '0';
        const aheadPercent = sunIntervals ? ((aheadCount / sunIntervals) * 100).toFixed(0) : '0';
        const behindPercent = sunIntervals ? ((behindCount / sunIntervals) * 100).toFixed(0) : '0';
        if (leftCount > rightCount) {
          seat = 'Left';
        } else if (rightCount > leftCount) {
          seat = 'Right';
        } else {
          seat = leftCount > 0 ? 'Left' : 'Neither (Sun not visible during flight)';
        }
        summary = `The sun is visible for ${percentVisible}% of the flight: ${leftPercent}% on the left, ${rightPercent}% on the right, ${aheadPercent}% ahead, ${behindPercent}% behind.`;
      }
      setRecommendation(seat);
      setSunSummary(summary);
      setDetails(
        `Breakdown:\n` +
        `Left: ${leftCount}, Right: ${rightCount}, Ahead: ${aheadCount}, Behind: ${behindCount}, Visible: ${sunIntervals}, Total: ${totalIntervals}`
      );
      setMapTime(depDT.toJSDate());
    } catch (err: any) {
      setError(err.message || 'Failed to get flight data.')
    } finally {
      setLoading(false)
    }
  }

  let mapBounds: L.LatLngBoundsExpression | undefined = undefined;
  if (flightPath.length > 0 && sourceAirport && destAirport) {
    mapBounds = [[sourceAirport.lat, sourceAirport.lon], [destAirport.lat, destAirport.lon]]
  }

  let minTime = depTime ? depTime.toMillis() : Date.now();
  let maxTime = arrivalTime ? arrivalTime.toMillis() : Date.now() + 1;
  let sunPoints: any[] = [];
  if (flightPath.length > 0 && depTime && arrivalTime) {
    sunPoints = interpolateSunAlongRoute(
      sourceAirport.lat, sourceAirport.lon,
      destAirport.lat, destAirport.lon,
      depTime.toUTC().toJSDate(), Number(flightTime), 10
    );
  }
  let sunPos: [number, number] | null = null;
  let planePos: [number, number] | null = null;
  let sunAz = null;
  let sunAlt = null;
  if (sunPoints.length > 0 && mapTime) {
    let idx = sunPoints.findIndex(p => Math.abs(p.time.getTime() - mapTime.getTime()) < 5 * 60 * 1000);
    if (idx === -1) idx = 0;
    sunPos = [sunPoints[idx].lat, sunPoints[idx].lon];
    sunAz = sunPoints[idx].azimuth;
    sunAlt = sunPoints[idx].altitude;
    planePos = [sunPoints[idx].lat, sunPoints[idx].lon];
  }
  // Subsolar point and terminator
  const subsolar = getSubsolarPoint(mapTime);
  const terminatorPoints = getTerminatorPolyline(mapTime);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-slate-100 flex flex-col font-sans">
      <header className="py-4 shadow-lg bg-slate-900/70 backdrop-blur-lg border-b border-slate-700/50 sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3 text-white">
            <span className="text-amber-400"><FaSun /></span>
            Helio Route
          </h1>
          <button
            className="rounded-full p-2 bg-slate-800 hover:bg-slate-700 transition-colors"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.07l-.71.71M21 12h-1M4 12H3m16.66 5.66l-.71-.71M4.05 4.93l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" /></svg>
            )}
          </button>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        <section className="w-full lg:w-1/3 bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-6 flex flex-col gap-6 sparkle-on-hover">
          <h2 className="text-xl font-bold text-white">Flight Details</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-1 text-slate-300" htmlFor="source">From</label>
                <Select<AirportOption>
                  id="source"
                  options={airportOptions}
                  value={airportOptions.find(opt => opt.value === sourceIATA)}
                  onChange={(selectedOption) => {
                    if (selectedOption) {
                      setSourceIATA(selectedOption.value);
                    }
                  }}
                  styles={customSelectStyles}
                  placeholder="Select source..."
                  components={{ MenuList }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-1 text-slate-300" htmlFor="dest">To</label>
                <Select<AirportOption>
                  id="dest"
                  options={airportOptions}
                  value={airportOptions.find(opt => opt.value === destIATA)}
                  onChange={(selectedOption) => {
                    if (selectedOption) {
                      setDestIATA(selectedOption.value);
                    }
                  }}
                  styles={customSelectStyles}
                  placeholder="Select destination..."
                  components={{ MenuList }}
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-1 text-slate-300" htmlFor="departure">Departure</label>
                <input
                  id="departure"
                  type="datetime-local"
                  className="w-full rounded-lg px-3 py-2 bg-slate-900/70 text-white placeholder:text-slate-500 border border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  value={departure}
                  onChange={e => setDeparture(e.target.value)}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-1 text-slate-300" htmlFor="flightTime">Flight Time (hrs)</label>
                <input
                  id="flightTime"
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="w-full rounded-lg px-3 py-2 bg-slate-900/70 text-white placeholder:text-slate-500 border border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  value={flightTime}
                  onChange={e => setFlightTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-4 w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-lg text-white shadow-lg hover:shadow-orange-400/20 hover:scale-[1.02] transition-all duration-300"
              disabled={loading}
            >
              {loading ? 'Calculating...' : 'Get Recommendation'}
            </button>
          </form>
          {error && <div className="mt-2 p-3 bg-red-500/80 rounded-lg text-white font-semibold">{error}</div>}
          {dstWarning && <div className="mt-2 p-3 bg-amber-400/80 rounded-lg text-slate-900 font-semibold whitespace-pre-line">{dstWarning}</div>}
          {recommendation && (
            <div className="mt-4 p-4 rounded-xl bg-slate-900/70 backdrop-blur-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold text-white">Recommended Seat</h3>
                <button onClick={toggleFavorite} className="transition" title={isCurrentFavorite ? "Remove from Favorites" : "Add to Favorites"}>
                  <FaStar className={isCurrentFavorite ? "text-amber-400" : "text-white"} />
                </button>
              </div>
              <div className="text-3xl font-extrabold text-amber-400 mb-2">{recommendation}</div>
              <div className="text-sm text-slate-300 mb-1">{sunSummary}</div>
              {details && <pre className="text-xs text-slate-400 whitespace-pre-wrap mt-2">{details}</pre>}
            </div>
          )}
          {favorites.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-white mb-2">Favorite Routes</h3>
              <ul className="space-y-2">
                {favorites.map((fav, index) => (
                  <li key={index} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70">
                    <button onClick={() => loadFavorite(fav.source, fav.dest)} className="flex-grow text-left">
                      <span>{fav.source}</span> → <span>{fav.dest}</span>
                    </button>
                    <button onClick={() => removeFavorite(fav.source, fav.dest)} className="ml-4 text-slate-400 hover:text-red-500 transition" title="Remove Favorite">
                      <FaStar />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="w-full lg:w-2/3 flex flex-col gap-6">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-6 flex-1 flex flex-col sparkle-on-hover">
            <h2 className="text-xl font-bold text-white mb-4">Flight Path & Sun Position</h2>
            {/* Time slider */}
            {depTime && arrivalTime && (
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2 text-slate-300" htmlFor="time-slider">Select Time Along Flight</label>
                <input
                  id="time-slider"
                  type="range"
                  min={minTime}
                  max={maxTime}
                  step={10 * 60 * 1000}
                  value={mapTime.getTime()}
                  onChange={e => setMapTime(new Date(Number(e.target.value)))}
                  className="w-full accent-amber-500"
                />
                <div className="text-xs text-slate-400 text-center mt-1">
                  {DateTime.fromJSDate(mapTime).toFormat('yyyy-LL-dd HH:mm ZZZZ')}
                </div>
              </div>
            )}
            <div className="h-[400px] rounded-lg overflow-hidden border-2 border-slate-700/50 shadow-inner">
              <MapContainer
                center={sourceAirport ? [sourceAirport.lat, sourceAirport.lon] : [0, 0]}
                zoom={3}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
              >
                <TileLayer
                  url={darkMode
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  }
                  attribution={darkMode
                    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    : '&copy; OpenStreetMap contributors'
                  }
                />
                {flightPath.length === 2 && (
                  <Polyline positions={flightPath} color="#fbbf24" weight={4} />
                )}
                {flightPath.length === 2 && (
                  <FitBounds bounds={flightPath as any} />
                )}
                {sourceAirport && (
                  <Marker position={[sourceAirport.lat, sourceAirport.lon]}>
                    <Popup>
                      <div className="font-bold">{sourceAirport.city} ({sourceAirport.iata})</div>
                      <div>{sourceAirport.name}</div>
                    </Popup>
                  </Marker>
                )}
                {destAirport && (
                  <Marker position={[destAirport.lat, destAirport.lon]}>
                    <Popup>
                      <div className="font-bold">{destAirport.city} ({destAirport.iata})</div>
                      <div>{destAirport.name}</div>
                    </Popup>
                  </Marker>
                )}
                {terminatorPoints && terminatorPoints.length > 0 && (
                  <Polyline positions={terminatorPoints.map(([lat, lon]) => [lat, lon])} color="#475569" weight={2} dashArray="4" />
                )}
                {subsolar && (
                  <CircleMarker center={[subsolar.lat, subsolar.lon]} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.7 }} radius={10}>
                    <Popup>
                      <div className="font-bold text-amber-500">Subsolar Point</div>
                      <div>Sun directly overhead</div>
                    </Popup>
                  </CircleMarker>
                )}
                {planePos && (
                  <Marker position={planePos}>
                    <Popup>
                      <div className="font-bold">Plane Position</div>
                      <div>{DateTime.fromJSDate(mapTime).toFormat('yyyy-LL-dd HH:mm ZZZZ')}</div>
                    </Popup>
                  </Marker>
                )}
                {sunPos && (
                  <CircleMarker center={sunPos} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.5 }} radius={7}>
                    <Popup>
                      <div className="font-bold text-amber-500">Sun Position</div>
                    </Popup>
                  </CircleMarker>
                )}
              </MapContainer>
            </div>
            {sunEvents.length > 0 && (
              <div className="mt-4 text-sm text-slate-200">
                <h3 className="font-semibold mb-1 text-white">Sun Events During Flight:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {sunEvents.map((ev, i) => (
                    <li key={i}>
                      <span className={ev.type === 'sunrise' ? 'text-amber-400' : 'text-sky-400'}>
                        {ev.type.charAt(0).toUpperCase() + ev.type.slice(1)}
                      </span>{' '}
                      at {DateTime.fromJSDate(ev.time).toFormat('HH:mm, dd LLL yyyy')} (lat {ev.lat.toFixed(2)}, lon {ev.lon.toFixed(2)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </main>
      <footer className="py-4 text-center text-slate-500 text-xs bg-slate-900/70 backdrop-blur-lg border-t border-slate-700/50">
        &copy; {new Date().getFullYear()} Helio Route &mdash; Find your perfect seat for sunrise and sunset views.
      </footer>
    </div>
  )
}

export default App
