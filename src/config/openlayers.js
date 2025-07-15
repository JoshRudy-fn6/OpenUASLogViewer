// OpenLayers Configuration
// Alternative imagery providers and configuration for OpenLayers

export const DEFAULT_CENTER = [0, 0] // [longitude, latitude]
export const DEFAULT_ZOOM = 2

// Map projection - Web Mercator (EPSG:3857) is standard for web maps
export const DEFAULT_PROJECTION = 'EPSG:3857'

// Alternative tile sources configuration
export const IMAGERY_PROVIDERS = [
    {
        name: 'OpenStreetMap',
        url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    },
    {
        name: 'CartoDB Positron',
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '© CartoDB, © OpenStreetMap contributors'
    },
    {
        name: 'Satellite (Esri)',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 18,
        attribution: 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics'
    },
    {
        name: 'Statkart Topo',
        url: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo4&zoom={z}&x={x}&y={y}',
        maxZoom: 18,
        attribution: 'Map tiles by Statkart'
    },
    {
        name: 'OpenSeaMap',
        url: 'http://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
        maxZoom: 18,
        attribution: 'Map tiles by OpenSeaMap'
    }
]

// Coordinate transformation utilities
export const COORDINATE_TRANSFORMS = {
    // WGS84 to Web Mercator
    WGS84_TO_MERCATOR: 'EPSG:4326',
    MERCATOR: 'EPSG:3857'
}

// Performance settings
export const RENDER_SETTINGS = {
    // Maximum number of features to render at once
    MAX_FEATURES: 10000,
    // Clustering threshold for trajectory points
    CLUSTER_DISTANCE: 50,
    // Simplification tolerance for trajectories
    SIMPLIFY_TOLERANCE: 0.0001
}
