import { useState, useEffect } from 'react'
import { getInitialBearing, interpolateSunAlongRoute, interpolateGreatCircle } from './sunUtils'
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Marker, Popup, Polyline as RLPolyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import airports from './airports.json'
import { DateTime } from 'luxon'
import SunCalc from 'suncalc'
import { FaPlaneDeparture, FaPlaneArrival, FaCalendarAlt, FaClock, FaQrcode, FaStar, FaTrash, FaSun, FaLink, FaCopy } from 'react-icons/fa';
import Select, { components, type MenuListProps } from 'react-select';
import { FixedSizeList as List } from 'react-window';
import L from 'leaflet';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Force deployment update - Enhanced markers and UI improvements

// Create custom modern markers
const createCustomIcon = (color: string, icon: any) => {
  return L.divIcon({
    html: `<div style="
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: white;
      font-size: 12px;
    ">${icon}</div>`,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const departureIcon = createCustomIcon('#10b981', '✈️');
const arrivalIcon = createCustomIcon('#ef4444', '✈️');
const planeIcon = createCustomIcon('#3b82f6', '✈️');

interface AirportOption {
  value: string;
  label: string;
  airport: any; // Store the full airport object
}

const airportOptions: AirportOption[] = airports.map(airport => ({
  value: airport.iata,
  label: `${airport.iata} - ${airport.city}, ${airport.country}`,
  airport: airport
}));

const customSelectStyles = {
  control: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: '0.5rem',
    border: state.isFocused ? '2px solid #f59e0b' : '2px solid transparent',
    boxShadow: 'none',
    minHeight: '44px',
    '&:hover': {
      borderColor: '#f59e0b'
    }
  }),
  menu: (provided: any) => ({
    ...provided,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '0.5rem',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    marginTop: '4px',
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#f59e0b' : state.isFocused ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
    color: state.isSelected ? '#1e293b' : '#d1d5db',
    padding: '12px 16px',
    cursor: 'pointer',
    margin: '2px 8px',
    borderRadius: '0.375rem',
    '&:active': {
      backgroundColor: 'rgba(251, 191, 36, 0.3)'
    }
  }),
  singleValue: (provided: any) => ({
    ...provided,
    color: '#d1d5db',
    fontWeight: '500',
  }),
  input: (provided: any) => ({
    ...provided,
    color: '#d1d5db'
  }),
  placeholder: (provided: any) => ({
    ...provided,
    color: '#64748b',
  }),
  noOptionsMessage: (provided: any) => ({
    ...provided,
    color: '#64748b',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    padding: '16px',
  }),
  menuList: (provided: any) => ({
    ...provided,
    padding: '4px',
  })
};

// Custom Option component for better airport display
const CustomOption = ({ data, isFocused, isSelected, innerProps, ...props }: any) => {
  const airport = data.airport;
  return (
    <div
      {...innerProps}
      className={`p-3 cursor-pointer transition-colors w-full ${
        isSelected ? 'bg-amber-500 text-slate-900' : 
        isFocused ? 'bg-amber-500/20 text-slate-200' : 'text-slate-300'
      }`}
    >
      <div className="flex items-center w-full">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{airport.iata}</div>
          <div className="text-xs opacity-80 truncate">{airport.city}, {airport.country}</div>
          <div className="text-xs opacity-60 truncate">{airport.name}</div>
        </div>
      </div>
    </div>
  );
};

const MenuList = (props: MenuListProps<AirportOption>) => {
  const { options, children, maxHeight, getValue } = props;
  const [value] = getValue();
  const initialOffset = Array.isArray(options) ? options.indexOf(value) * 50 : 0; // Reduced item size

  return (
    <List
      width="100%"
      height={maxHeight}
      itemCount={Array.isArray(children) ? children.length : 0}
      itemSize={50} // Reduced for better fit
      initialScrollOffset={initialOffset}
    >
      {({ index, style }) => (
        <div style={{ ...style, width: '100%', overflow: 'hidden' }}>
          {Array.isArray(children) ? children[index] : null}
        </div>
      )}
    </List>
  );
};

// Map controller component that handles bounds fitting
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
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
  const [sourceIATA, setSourceIATA] = useState('DEL')
  const [destIATA, setDestIATA] = useState('BLR')
  const [departure, setDeparture] = useState('2025-06-22T05:00')
  const [flightTime, setFlightTime] = useState('24')

  const [sourceAirport, setSourceAirport] = useState<any>(airports.find(a => a.iata === 'DEL'))
  const [destAirport, setDestAirport] = useState<any>(airports.find(a => a.iata === 'BLR'))
  
  const [recommendation, setRecommendation] = useState('')
  const [flightPath, setFlightPath] = useState<[number, number][]>([])
  const [flightPathSegments, setFlightPathSegments] = useState<[number, number][][]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [depTime, setDepTime] = useState<DateTime | null>(null)
  const [arrivalTime, setArrivalTime] = useState<DateTime | null>(null)
  const [dstWarning, setDstWarning] = useState<string | null>(null)
  const [sunSummary, setSunSummary] = useState<string>('')
  const [sunEvents, setSunEvents] = useState<Array<{ type: 'sunrise' | 'sunset'; time: Date; lat: number; lon: number; azimuth: number; position: string }>>([])
  const [mapTime, setMapTime] = useState<Date>(() => new Date());
  const [darkMode, setDarkMode] = useState(true);
  const [favorites, setFavorites] = useState<Array<{ source: string, dest: string }>>([]);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);

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

  const swapAirports = () => {
    const temp = sourceIATA;
    setSourceIATA(destIATA);
    setDestIATA(temp);
  };

  const makeShareLink = () => {
    const params = new URLSearchParams();
    params.set('source', sourceIATA);
    params.set('destination', destIATA);
    params.set('departure', departure);
    params.set('duration', flightTime);
    
    const shareableUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    
    navigator.clipboard.writeText(shareableUrl).then(() => {
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareableUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    });
  };

  const prefillFromURL = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sourceParam = urlParams.get('source');
    const destinationParam = urlParams.get('destination');
    const departureParam = urlParams.get('departure');
    const durationParam = urlParams.get('duration');

    if (sourceParam) {
      setSourceIATA(sourceParam.toUpperCase());
      const foundSource = airports.find(a => a.iata === sourceParam.toUpperCase());
      if (foundSource) setSourceAirport(foundSource);
    }
    
    if (destinationParam) {
      setDestIATA(destinationParam.toUpperCase());
      const foundDest = airports.find(a => a.iata === destinationParam.toUpperCase());
      if (foundDest) setDestAirport(foundDest);
    }
    
    if (departureParam) {
      setDeparture(departureParam);
    }
    
    if (durationParam) {
      setFlightTime(durationParam);
    }
  };

  // Parse URL parameters on component mount
  useEffect(() => {
    prefillFromURL();
  }, []);

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
    setFlightPathSegments([])
    setDepTime(null)
    setArrivalTime(null)
    setDstWarning(null)
    setSunSummary('')
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
      
      // Create a curved flight path with multiple points
      const createFlightPath = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const points: [number, number][] = [];
        const steps = 20; // Number of points along the path
        
        for (let i = 0; i <= steps; i++) {
          const frac = i / steps;
          const point = interpolateGreatCircle(lat1, lon1, lat2, lon2, frac);
          points.push([point.lat, point.lon]);
        }
        
        // Check for date line crossing and split path if needed
        const segments: [number, number][][] = [];
        let currentSegment: [number, number][] = [];
        
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          
          if (currentSegment.length === 0) {
            currentSegment.push(point);
          } else {
            const prevPoint = currentSegment[currentSegment.length - 1];
            const lonDiff = Math.abs(point[1] - prevPoint[1]);
            
            // If longitude difference is greater than 180°, it's a date line crossing
            if (lonDiff > 180) {
              // End current segment and start new one
              if (currentSegment.length > 0) {
                segments.push([...currentSegment]);
              }
              currentSegment = [point];
            } else {
              currentSegment.push(point);
            }
          }
        }
        
        // Add the last segment
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
        }
        
        return segments;
      };
      
      const flightPathSegments = createFlightPath(src.lat, src.lon, dst.lat, dst.lon);
      setFlightPathSegments(flightPathSegments);
      setFlightPath(flightPathSegments.flat()); // Flatten for backward compatibility

      const intervalMin = 10;
      const sunPoints = interpolateSunAlongRoute(
        src.lat, src.lon, dst.lat, dst.lon,
        depDT.toUTC().toJSDate(), Number(flightTime), intervalMin
      );
      
      let events: Array<{ type: 'sunrise' | 'sunset'; time: Date; lat: number; lon: number; azimuth: number; position: string }> = [];
      let prevAlt = null;
      for (let i = 0; i < sunPoints.length; i++) {
        const p = sunPoints[i];
        const times = SunCalc.getTimes(p.time, p.lat, p.lon);
        
        // Calculate flight heading at this point
        let heading = 0;
        if (i < sunPoints.length - 1) {
          const p2 = sunPoints[i + 1];
          heading = getInitialBearing(p.lat, p.lon, p2.lat, p2.lon);
        } else if (i > 0) {
          const p1 = sunPoints[i - 1];
          heading = getInitialBearing(p1.lat, p1.lon, p.lat, p.lon);
        }
        
        // Calculate relative sun position
        const relAngle = (p.azimuth - heading + 360) % 360;
        let position = '';
        if (relAngle > 45 && relAngle <= 135) position = 'Right';
        else if (relAngle > 225 && relAngle <= 315) position = 'Left';
        else if (relAngle > 315 || relAngle <= 45) position = 'Ahead';
        else if (relAngle > 135 && relAngle <= 225) position = 'Behind';
        
        if (prevAlt !== null && prevAlt < 0 && p.altitude >= 0) {
          let eventTime = times.sunrise;
          if (!(eventTime && eventTime >= sunPoints[i-1].time && eventTime <= p.time)) {
            const frac = -prevAlt / (p.altitude - prevAlt);
            eventTime = new Date(sunPoints[i-1].time.getTime() + frac * (p.time.getTime() - sunPoints[i-1].time.getTime()));
          }
          events.push({ type: 'sunrise', time: eventTime, lat: p.lat, lon: p.lon, azimuth: p.azimuth, position });
        }
        if (prevAlt !== null && prevAlt >= 0 && p.altitude < 0) {
          let eventTime = times.sunset;
          if (!(eventTime && eventTime >= sunPoints[i-1].time && eventTime <= p.time)) {
            const frac = prevAlt / (prevAlt - p.altitude);
            eventTime = new Date(sunPoints[i-1].time.getTime() + frac * (p.time.getTime() - sunPoints[i-1].time.getTime()));
          }
          events.push({ type: 'sunset', time: eventTime, lat: p.lat, lon: p.lon, azimuth: p.azimuth, position });
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
  let currentSunPoint: any = null;
  if (sunPoints.length > 0 && mapTime) {
    let idx = sunPoints.findIndex(p => Math.abs(p.time.getTime() - mapTime.getTime()) < 5 * 60 * 1000);
    if (idx === -1) idx = 0;
    currentSunPoint = sunPoints[idx];
    sunPos = [currentSunPoint.lat, currentSunPoint.lon];
    sunAz = currentSunPoint.azimuth;
    sunAlt = currentSunPoint.altitude;
    planePos = [currentSunPoint.lat, currentSunPoint.lon];
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
        <section className="w-full lg:w-2/5 bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-6 flex flex-col gap-6 sparkle-on-hover">
          <h2 className="text-xl font-bold text-white">Flight Details</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex gap-4 items-end">
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
                  components={{ MenuList, Option: CustomOption }}
                  isSearchable={true}
                  filterOption={(option, inputValue) => {
                    const airport = option.data.airport;
                    const searchTerm = inputValue.toLowerCase();
                    return (
                      airport.iata.toLowerCase().includes(searchTerm) ||
                      airport.city.toLowerCase().includes(searchTerm) ||
                      airport.country.toLowerCase().includes(searchTerm) ||
                      airport.name.toLowerCase().includes(searchTerm)
                    );
                  }}
                />
              </div>
              
              {/* Swap Button */}
              <button
                type="button"
                onClick={swapAirports}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-amber-400 transition-all duration-200 border border-slate-600/50 hover:border-amber-500/50"
                title="Swap airports"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
              
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
                  components={{ MenuList, Option: CustomOption }}
                  isSearchable={true}
                  filterOption={(option, inputValue) => {
                    const airport = option.data.airport;
                    const searchTerm = inputValue.toLowerCase();
                    return (
                      airport.iata.toLowerCase().includes(searchTerm) ||
                      airport.city.toLowerCase().includes(searchTerm) ||
                      airport.country.toLowerCase().includes(searchTerm) ||
                      airport.name.toLowerCase().includes(searchTerm)
                    );
                  }}
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
              {loading ? 'Calculating...' : 'Get Helio Route'}
            </button>
          </form>
          
          {/* Copy Shareable Link Button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={makeShareLink}
              className="w-full py-2 px-4 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-amber-400 transition-all duration-200 border border-slate-600/50 hover:border-amber-500/50 flex items-center justify-center gap-2"
              title="Copy shareable link with current flight details"
            >
              <FaLink className="w-4 h-4" />
              {showCopyFeedback ? (
                <>
                  <FaCopy className="w-4 h-4" />
                  Link copied!
                </>
              ) : (
                <>
                  <FaCopy className="w-4 h-4" />
                  Copy shareable link
                </>
              )}
            </button>
          </div>
          
          {error && <div className="mt-2 p-3 bg-red-500/80 rounded-lg text-white font-semibold">{error}</div>}
          {dstWarning && <div className="mt-2 p-3 bg-amber-400/80 rounded-lg text-slate-900 font-semibold whitespace-pre-line">{dstWarning}</div>}
          {recommendation && (
            <div className="mt-4 p-4 rounded-xl bg-slate-900/70 backdrop-blur-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold text-white">Helio Side</h3>
                <button onClick={toggleFavorite} className="transition" title={isCurrentFavorite ? "Remove from Favorites" : "Add to Favorites"}>
                  <FaStar className={isCurrentFavorite ? "text-amber-400" : "text-white"} />
                </button>
              </div>
              <div className="text-3xl font-extrabold text-amber-400 mb-2">{recommendation}</div>
              <div className="text-sm text-slate-300">{sunSummary}</div>
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
        <section className="w-full lg:w-2/5 flex flex-col gap-6">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-6 flex-1 flex flex-col sparkle-on-hover">
            <h2 className="text-xl font-bold text-white mb-4">Flight Path & Sun Position</h2>
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
                {flightPathSegments.length > 0 && flightPathSegments.map((segment, index) => (
                  <Polyline 
                    key={index}
                    positions={segment} 
                    color="#fbbf24" 
                    weight={3} 
                    dashArray="8, 4"
                    opacity={0.8}
                  />
                ))}
                {flightPath.length > 0 && (
                  <FitBounds bounds={flightPath as any} />
                )}
                {sourceAirport && (
                  <Marker position={[sourceAirport.lat, sourceAirport.lon]} icon={departureIcon}>
                    <Popup>
                      <div className="font-bold">{sourceAirport.city} ({sourceAirport.iata})</div>
                      <div>{sourceAirport.name}</div>
                    </Popup>
                  </Marker>
                )}
                {destAirport && (
                  <Marker position={[destAirport.lat, destAirport.lon]} icon={arrivalIcon}>
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
                  <Marker position={planePos} icon={planeIcon}>
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
            {/* Time slider moved below the map */}
            {depTime && arrivalTime && (
              <div className="mt-4">
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
                
                {/* Enhanced time slider information */}
                {currentSunPoint && (
                  <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                    <div className="text-xs text-slate-300 space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">Position:</span>
                        <span>{currentSunPoint.lat.toFixed(2)}°N, {currentSunPoint.lon.toFixed(2)}°E</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Sun Altitude:</span>
                        <span className={currentSunPoint.altitude >= 0 ? 'text-amber-400' : 'text-slate-400'}>
                          {currentSunPoint.altitude.toFixed(1)}°
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Sun Azimuth:</span>
                        <span>{currentSunPoint.azimuth.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Flight Progress:</span>
                        <span>{((mapTime.getTime() - minTime) / (maxTime - minTime) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Time Remaining:</span>
                        <span>{((maxTime - mapTime.getTime()) / (1000 * 60 * 60)).toFixed(1)}h</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
        
        {/* Dedicated Sunset/Sunrise Information Section */}
        {(depTime && arrivalTime) && (
          <section className="w-full lg:w-1/5 bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-6 sparkle-on-hover">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <FaSun className="text-amber-400" />
              Sunset & Sunrise Info
            </h2>
            
            {sunEvents.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-slate-300 mb-3">
                  <p className="font-semibold text-white mb-1">Sun Events During Your Flight:</p>
                  <p className="text-slate-400">The following sunrise and sunset events will occur along your flight path:</p>
                </div>
                
                <div className="space-y-3">
                  {sunEvents.map((ev, i) => (
                    <div key={i} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={ev.type === 'sunrise' ? 'text-amber-400' : 'text-sky-400'}>
                          {ev.type === 'sunrise' ? '🌅' : '🌇'}
                        </span>
                        <span className={`font-semibold ${ev.type === 'sunrise' ? 'text-amber-400' : 'text-sky-400'}`}>
                          {ev.type.charAt(0).toUpperCase() + ev.type.slice(1)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-300">
                        <div className="font-medium">
                          {DateTime.fromJSDate(ev.time).toFormat('HH:mm, dd LLL yyyy')}
                        </div>
                        <div className="text-slate-400 text-xs mt-1 space-y-1">
                          <div>Location: {ev.lat.toFixed(2)}°N, {ev.lon.toFixed(2)}°E</div>
                          <div>Sun Azimuth: {ev.azimuth.toFixed(1)}°</div>
                          <div className="font-medium text-slate-300">
                            Position: <span className={ev.position === 'Left' ? 'text-blue-400' : ev.position === 'Right' ? 'text-green-400' : 'text-amber-400'}>{ev.position}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🌙</div>
                <h3 className="text-lg font-semibold text-white mb-2">No Sunrise/Sunset Events</h3>
                <p className="text-slate-400 text-sm">
                  During your flight from {sourceAirport?.city} to {destAirport?.city}, 
                  there will be no sunrise or sunset events along the flight path.
                </p>
                <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400">
                    <div className="font-medium text-slate-300 mb-1">Flight Duration:</div>
                    <div>{flightTime} hours</div>
                    <div className="font-medium text-slate-300 mt-2 mb-1">Departure:</div>
                    <div>{depTime?.toFormat('HH:mm, dd LLL yyyy')}</div>
                    <div className="font-medium text-slate-300 mt-2 mb-1">Arrival:</div>
                    <div>{arrivalTime?.toFormat('HH:mm, dd LLL yyyy')}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="py-4 text-center text-slate-500 text-xs bg-slate-900/70 backdrop-blur-lg border-t border-slate-700/50">
        Made with Cursor by <a href="https://github.com/Ayush-IITGoa" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">Ayush Raj</a> for Trilogy
      </footer>
    </div>
  )
}

export default App
/ /   F o r c e   d e p l o y m e n t   u p d a t e   -   E n h a n c e d   m a r k e r s   a n d   U I   i m p r o v e m e n t s  
 