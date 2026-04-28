/**
 * Predefined locations for the Ropar area used as quick-pick shortcuts
 * in the ride search / publish flow.
 *
 * To add a new location, simply append an entry to the LOCATIONS array.
 * No changes are required in any component.
 *
 * Schema per entry:
 *   id        – unique snake_case identifier (used as React key)
 *   name      – human-readable display name
 *   latitude  – WGS-84 latitude
 *   longitude – WGS-84 longitude
 *   radius    – proximity match radius in metres (used by getSmartLocation)
 *               Tighter for on-campus spots, looser for city landmarks.
 *
 * The IIT Ropar Main Gate entry also doubles as the default map center
 * (see MAP_DEFAULTS below).
 */

const LOCATIONS = [
  {
    id: "iit_ropar_main_gate",
    name: "IIT Ropar Main Gate",
    latitude: 30.971114,
    longitude: 76.472975,
    radius: 200,
  },
  {
    id: "ropar_bus_stand",
    name: "Ropar Bus Stand",
    latitude: 30.9695,
    longitude: 76.5250,
    radius: 300,
  },
  {
    id: "ropar_railway_station",
    name: "Ropar Railway Station",
    latitude: 30.9716,
    longitude: 76.5326,
    radius: 300,
  },
  {
    id: "bela_chowk",
    name: "Bela Chowk",
    latitude: 30.9660,
    longitude: 76.5100,
    radius: 250,
  },
  {
    id: "ropar_headworks",
    name: "Ropar Headworks",
    latitude: 30.9755,
    longitude: 76.5267,
    radius: 300,
  },
  {
    id: "anandpur_sahib",
    name: "Anandpur Sahib",
    latitude: 31.2320,
    longitude: 76.4975,
    radius: 500,
  },
  {
    id: "morinda",
    name: "Morinda",
    latitude: 30.7970,
    longitude: 76.4928,
    radius: 500,
  },
  {
    id: "chandigarh_isbt",
    name: "Chandigarh ISBT",
    latitude: 30.7383,
    longitude: 76.7909,
    radius: 400,
  },
  {
    id: "chandigarh_railway_station",
    name: "Chandigarh Railway Station",
    latitude: 30.7058,
    longitude: 76.8027,
    radius: 400,
  },
  {
    id: "patiala_bus_stand",
    name: "Patiala Bus Stand",
    latitude: 30.3398,
    longitude: 76.3869,
    radius: 400,
  },
  {
    id: "beas_hostel",
    name: "Beas Hostel",
    latitude: 30.969245,
    longitude: 76.466812,
    radius: 150,
  },
  {
    id: "satluj_hostel",
    name: "Satluj Hostel",
    latitude: 30.969538,
    longitude: 76.468386,
    radius: 150,
  },
  {
    id: "chenab_hostel",
    name: "Chenab Hostel",
    latitude: 30.969239,
    longitude: 76.465780,
    radius: 150,
  },
  {
    id: "brahmaputra_boys_hostel",
    name: "Brahmaputra Boys Hostel",
    latitude: 30.967445,
    longitude: 76.467305,
    radius: 150,
  },
  {
    id: "raavi_hostel",
    name: "Raavi Hostel",
    latitude: 30.967299,
    longitude: 76.469720,
    radius: 150,
  },
  {
    id: "brahmaputra_girls_hostel",
    name: "Brahmaputra Girls Hostel",
    latitude: 30.967445,
    longitude: 76.467305,
    radius: 150,
  },
  {
    id: "electrical_dept",
    name: "Electrical Dept",
    latitude: 30.968896,
    longitude: 76.474780,
    radius: 150,
  },
  {
    id: "cs_dept",
    name: "CS Dept",
    latitude: 30.969105,
    longitude: 76.475596,
    radius: 150,
  },
  {
    id: "admin_building",
    name: "Admin Building",
    latitude: 30.968784,
    longitude: 76.473314,
    radius: 150,
  },
  {
    id: "mech_dept",
    name: "Mech Dept",
    latitude: 30.968821,
    longitude: 76.471479,
    radius: 150,
  },
  {
    id: "chem_dept",
    name: "Chem Dept",
    latitude: 30.969016,
    longitude: 76.470614,
    radius: 150,
  },
  {
    id: "library",
    name: "Library",
    latitude: 30.967002,
    longitude: 76.473234,
    radius: 150,
  },
  {
    id: "canteen",
    name: "Canteen",
    latitude: 30.966471,
    longitude: 76.471306,
    radius: 150,
  },
  {
    id: "mess",
    name: "Mess",
    latitude: 30.967078,
    longitude: 76.467842,
    radius: 150,
  },
  {
    id: "shagun_dhaba",
    name: "Shagun Dhaba",
    latitude: 30.955608,
    longitude: 76.510844,
    radius: 250,
  },
  {
    id: "audi",
    name: "Auditorium",
    latitude: 30.967412,
    longitude: 76.473382,
    radius: 150,
  },
  {
    id: "util",
    name: "Utility Block",
    latitude: 30.967834,
    longitude: 76.469703,
    radius: 150,
  },



];

export default LOCATIONS;

// ─── Normalised shape (lat/lng keys) consumed by Leaflet-based components ────
// Components can import PRESET_LOCATIONS directly; the shape mirrors what the
// external Photon/Nominatim autocomplete returns so that handleSelect() works
// uniformly for both.
export const PRESET_LOCATIONS = LOCATIONS.map((loc) => ({
  id: loc.id,
  name: loc.name,
  lat: loc.latitude,
  lng: loc.longitude,
  radius: loc.radius,
}));

// ─── Default map viewport (IIT Ropar) ────────────────────────────────────────
export const MAP_DEFAULTS = {
  center: [LOCATIONS[0].latitude, LOCATIONS[0].longitude], // [30.9687, 76.4731]
  zoom: 14,
};
