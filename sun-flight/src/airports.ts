export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string; // IANA timezone, e.g. 'Asia/Singapore'
}

export const airports: Airport[] = [
  { iata: 'SIN', name: 'Changi Airport', city: 'Singapore', country: 'Singapore', lat: 1.3644, lon: 103.9915, timezone: 'Asia/Singapore' },
  { iata: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom', lat: 51.4700, lon: -0.4543, timezone: 'Europe/London' },
  { iata: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', lat: 40.6413, lon: -73.7781, timezone: 'America/New_York' },
  { iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA', lat: 33.9416, lon: -118.4085, timezone: 'America/Los_Angeles' },
  { iata: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', lat: 49.0097, lon: 2.5479, timezone: 'Europe/Paris' },
  { iata: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE', lat: 25.2532, lon: 55.3657, timezone: 'Asia/Dubai' },
  { iata: 'HND', name: 'Haneda Airport', city: 'Tokyo', country: 'Japan', lat: 35.5494, lon: 139.7798, timezone: 'Asia/Tokyo' },
  { iata: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', lat: -33.9399, lon: 151.1753, timezone: 'Australia/Sydney' },
  { iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', lat: 50.0379, lon: 8.5622, timezone: 'Europe/Berlin' },
  { iata: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA', lat: 37.6213, lon: -122.3790, timezone: 'America/Los_Angeles' },
  // ...add more as needed
]; 