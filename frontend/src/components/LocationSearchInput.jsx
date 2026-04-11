import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';
import { PRESET_LOCATIONS } from '../config/locations';
import { searchLocation, reverseGeocode } from '../utils/geoUtils';

export default function LocationSearchInput({
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Search for a location..."
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const wrapperRef = useRef(null);
  const debounceTimer = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch results based on query
  useEffect(() => {
    if (!isOpen) return;

    // If empty query, early return (will show presets naturally)
    if (!value || value.trim() === '') {
      setResults([]);
      setError(null);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setLoading(true);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await searchLocation(value);
        setResults(data);
        if (data.length === 0) {
          setError("No results found");
        }
      } catch (err) {
        if (err.name !== 'AbortError') setError("Failed to search location");
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceTimer.current);
  }, [value, isOpen]);

  const handleSelect = (loc) => {
    onChange(loc.name);
    setIsOpen(false);
    onSelect(loc);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLoading(true);
    setIsOpen(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const locName = await reverseGeocode(latitude, longitude);
        handleSelect({ lat: latitude, lng: longitude, name: locName.name || "Current Location" });
      } catch (err) {
        setError("Could not get current location address.");
      } finally {
        setLoading(false);
      }
    }, () => {
      setLoading(false);
      setError("Location access denied.");
    });
  };

  const showPresets = !value || value.trim() === '';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {label}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          style={{ paddingLeft: '2.5rem' }}
        />
        <Search size={18} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-card)', zIndex: 9999,
          borderRadius: '8px', boxShadow: 'var(--glass-shadow)',
          marginTop: '0.5rem', maxHeight: '300px', overflowY: 'auto',
          border: '1px solid var(--border)'
        }}>
          {loading && (
            <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="spin" /> Searching...
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: '1rem', color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          {!loading && showPresets && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={handleUseCurrentLocation}
                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--primary)', fontWeight: '500' }}
                className="hover-bg"
              >
                <Navigation size={16} /> Use Current Location
              </div>

              <div style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.03)' }}>
                PRESET LOCATIONS
              </div>
              {PRESET_LOCATIONS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  className="hover-bg"
                >
                  <MapPin size={16} color="var(--primary)" />
                  <div style={{ flex: 1 }}>{preset.name}</div>
                </div>
              ))}
            </div>
          )}

          {!loading && !showPresets && results.length > 0 && (
            <div>
              {results.map((result, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelect(result)}
                  style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  className="hover-bg"
                >
                  <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={16} color="var(--primary)" /> {result.name}
                  </div>
                  {result.address && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{result.address}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`
        .hover-bg:hover {
          background: var(--bg-hover) !important;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        :root {
           --bg-hover: rgba(100, 100, 100, 0.1);
        }
      `}</style>
    </div>
  );
}
