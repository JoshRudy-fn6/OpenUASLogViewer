// Cesium Ion Configuration
//
// To use Cesium Ion services (high-resolution imagery, terrain, etc.):
// 1. Sign up for a free account at https://cesium.com/ion/
// 2. Create an access token in your Ion dashboard
// 3. Replace the empty string below with your token
//
// Note: The application will work without a token using Cesium's default free services,
// but you may encounter some limitations and 403 errors for premium assets.

export const CESIUM_ION_ACCESS_TOKEN = ''

// Fallback configuration when no token is provided
export const USE_DEFAULT_IMAGERY = true

// You can also use alternative free imagery providers
export const ALTERNATIVE_IMAGERY_PROVIDERS = [
    {
        name: 'OpenStreetMap',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        credit: '© OpenStreetMap contributors'
    },
    {
        name: 'CartoDB Positron',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        credit: '© CartoDB, © OpenStreetMap contributors'
    }
]
