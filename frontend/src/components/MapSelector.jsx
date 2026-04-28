import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getSmartLocation, getRoute } from '../utils/geoUtils';
import { MAP_DEFAULTS, PRESET_LOCATIONS } from '../config/locations';
import 'leaflet/dist/leaflet.css';

// Fix leaf icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Create custom icons (optional, but nice)
const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});


// Helper component to bind map events and fit bounds
const MapController = ({ pickup, destination, activeSelect, onMapClick, routeGeometry }) => {
  const map = useMap();
  const routeLayerRef = useRef(null);

  useMapEvents({
    click(e) {
      if (activeSelect) {
        onMapClick(e.latlng.lat, e.latlng.lng, activeSelect);
      }
    }
  });

  // Fit bounds when both pickup and destination exist
  useEffect(() => {
    if (pickup?.lat && destination?.lat) {
      const bounds = L.latLngBounds(
        [pickup.lat, pickup.lng],
        [destination.lat, destination.lng]
      );
      // Wait for route to draw, but initially zoom to points
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (pickup?.lat) {
      map.setView([pickup.lat, pickup.lng], 15);
    } else if (destination?.lat) {
      map.setView([destination.lat, destination.lng], 15);
    }
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, map]);

  // Handle drawing the route
  useEffect(() => {
    // Clean up previous route
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeGeometry) {
      // Create new polyline from GeoJSON
      routeLayerRef.current = L.geoJSON(routeGeometry, {
        style: {
          color: 'var(--primary, #3b82f6)',
          weight: 4,
          opacity: 0.8,
          lineJoin: 'round'
        }
      }).addTo(map);

      // Fit bounds to the exact route rather than straight line
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
    }

    return () => {
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
      }
    }
  }, [routeGeometry, map]);

  return null;
};

export default function MapSelector({
  pickup,
  destination,
  activeSelect, // 'pickup' | 'destination' | null
  onLocationChange, // (type: 'pickup' | 'destination', locationObj) => void
  onRouteCalculated // (routeData) => void
}) {
  const [routeGeometry, setRouteGeometry] = useState(null);
  const routeDebounceRef = useRef(null);

  // Handle map click — uses getSmartLocation so preset radius matching works
  const handleMapClick = async (lat, lng, type) => {
    try {
      const resolved = await getSmartLocation(lat, lng, PRESET_LOCATIONS);
      onLocationChange(type, { lat, lng, name: resolved.name });
    } catch (err) {
      // Silent error for map clicks
      onLocationChange(type, { lat, lng, name: 'Dropped Pin' });
    }
  };

  // Handle marker drag — uses getSmartLocation so preset radius matching works
  const handleMarkerDragEnd = async (e, type) => {
    const { lat, lng } = e.target.getLatLng();
    try {
      const resolved = await getSmartLocation(lat, lng, PRESET_LOCATIONS);
      onLocationChange(type, { lat, lng, name: resolved.name });
    } catch (err) {
      onLocationChange(type, { lat, lng, name: 'Dropped Pin' });
    }
  };

  // Fetch route when points change
  useEffect(() => {
    if (pickup?.lat && destination?.lat) {
      if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);

      routeDebounceRef.current = setTimeout(async () => {
        try {
          const routeData = await getRoute(pickup, destination);
          setRouteGeometry(routeData.geometry);
          onRouteCalculated(routeData); // Send distance/duration to parent
        } catch (err) {
          console.error("Routing error");
          setRouteGeometry(null);
        }
      }, 500); // 500ms debounce
    } else {
      setRouteGeometry(null);
      onRouteCalculated(null);
    }

    return () => clearTimeout(routeDebounceRef.current);
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  return (
    <div style={{ flex: 1, minHeight: '350px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer center={MAP_DEFAULTS.center} zoom={MAP_DEFAULTS.zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CartoDB'
        />
        
        <MapController 
          pickup={pickup} 
          destination={destination} 
          activeSelect={activeSelect}
          onMapClick={handleMapClick}
          routeGeometry={routeGeometry}
        />

        {pickup?.lat && (
          <Marker 
            position={[pickup.lat, pickup.lng]} 
            icon={pickupIcon}
            draggable={true}
            eventHandlers={{ dragend: (e) => handleMarkerDragEnd(e, 'pickup') }}
          />
        )}
        
        {destination?.lat && (
          <Marker 
            position={[destination.lat, destination.lng]} 
            icon={destIcon}
            draggable={true}
            eventHandlers={{ dragend: (e) => handleMarkerDragEnd(e, 'destination') }}
          />
        )}
      </MapContainer>
    </div>
  );
}
