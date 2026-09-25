/** Map links for an address: Apple Maps (iPhone default) and Google Maps. */
export const appleMaps = (a: string) => `https://maps.apple.com/?q=${encodeURIComponent(a)}`;
export const googleMaps = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
