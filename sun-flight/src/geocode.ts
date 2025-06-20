export async function geocodeCity(city: string): Promise<{ lat: number, lon: number }> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`;
  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'sun-flight-app/1.0 (your@email.com)'
    }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch geocode data');
  }
  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error('City not found');
  }
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon)
  };
} 