// IFCN publishes a status per PR number. paid_routes.geojson carries OSM's
// route ids, which mostly match but not always -- where they don't, a status
// silently never reaches the map, because nothing joins them.
//
// Keyed by IFCN's id, valued by the geojson ids it applies to.
const STATUS_ID_ALIASES: Record<string, string[]> = {
  // IFCN lists Vereda do Pico do Castelo once; OSM splits it into an east and
  // a west segment. One status governs both.
  'PR2-PS': ['PR2 VE-PS', 'PR2 VO-PS'],
};

/** Every geojson route id an IFCN status applies to. */
export function mapIdsForStatusId(statusId: string): string[] {
  return STATUS_ID_ALIASES[statusId] ?? [statusId];
}

/** The IFCN status id covering a geojson route id. */
export function statusIdForMapId(mapId: string): string {
  for (const [statusId, mapIds] of Object.entries(STATUS_ID_ALIASES)) {
    if (mapIds.includes(mapId)) return statusId;
  }
  return mapId;
}
