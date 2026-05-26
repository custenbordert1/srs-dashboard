import { normalizeStateCode } from "@/lib/dm-territory-map";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";

/** Metro clusters for safe city expansion — same state only. */
const METRO_CLUSTERS: Record<string, string[]> = {
  "dallas|TX": ["Dallas", "Fort Worth", "Arlington", "Plano", "Irving"],
  "houston|TX": ["Houston", "Pasadena", "Pearland", "Sugar Land", "The Woodlands"],
  "san antonio|TX": ["San Antonio", "New Braunfels", "Schertz", "Converse"],
  "phoenix|AZ": ["Phoenix", "Mesa", "Chandler", "Glendale", "Scottsdale"],
  "atlanta|GA": ["Atlanta", "Marietta", "Sandy Springs", "Roswell", "Alpharetta"],
  "chicago|IL": ["Chicago", "Evanston", "Naperville", "Schaumburg", "Joliet"],
  "detroit|MI": ["Detroit", "Warren", "Dearborn", "Livonia", "Troy"],
  "charlotte|NC": ["Charlotte", "Concord", "Gastonia", "Rock Hill"],
  "orlando|FL": ["Orlando", "Kissimmee", "Sanford", "Winter Park"],
  "tampa|FL": ["Tampa", "St. Petersburg", "Clearwater", "Brandon"],
  "denver|CO": ["Denver", "Aurora", "Lakewood", "Thornton", "Arvada"],
  "kansas city|MO": ["Kansas City", "Independence", "Overland Park", "Lee's Summit"],
  "st louis|MO": ["St. Louis", "St. Charles", "Florissant", "Chesterfield"],
  "cincinnati|OH": ["Cincinnati", "Hamilton", "Middletown", "Fairfield"],
  "cleveland|OH": ["Cleveland", "Parma", "Lorain", "Elyria"],
  "pittsburgh|PA": ["Pittsburgh", "Bethel Park", "Monroeville", "Cranberry Township"],
  "philadelphia|PA": ["Philadelphia", "Camden", "Wilmington", "Cherry Hill"],
  "nashville|TN": ["Nashville", "Murfreesboro", "Franklin", "Clarksville"],
  "memphis|TN": ["Memphis", "Southaven", "Bartlett", "Germantown"],
  "indianapolis|IN": ["Indianapolis", "Carmel", "Fishers", "Greenwood"],
  "milwaukee|WI": ["Milwaukee", "Waukesha", "Racine", "Kenosha"],
  "minneapolis|MN": ["Minneapolis", "St. Paul", "Bloomington", "Brooklyn Park"],
  "seattle|WA": ["Seattle", "Tacoma", "Bellevue", "Everett"],
  "portland|OR": ["Portland", "Gresham", "Hillsboro", "Beaverton"],
  "las vegas|NV": ["Las Vegas", "Henderson", "North Las Vegas", "Paradise"],
  "salt lake city|UT": ["Salt Lake City", "West Valley City", "Provo", "Ogden"],
};

function clusterKey(city: string, state: string): string {
  const location = normalizeJobLocationFields(city, state);
  return `${location.city.toLowerCase()}|${normalizeStateCode(location.usState)}`;
}

export function expandMetroCities(city: string, state: string, limit = 5): string[] {
  const location = normalizeJobLocationFields(city, state);
  const key = clusterKey(location.city, location.usState);
  const cluster = METRO_CLUSTERS[key];
  const cities = cluster?.length ? cluster : [location.city];
  const unique = [...new Set(cities.map((c) => c.trim()).filter(Boolean))];
  return unique.slice(0, Math.max(1, limit));
}
