import got from 'got';

export interface VinInfo {
  make: string;
  model: string;
  year: number | null;
  trim: string;
}

// NHTSA vPIC — free, no key.
export async function decodeVin(vin: string): Promise<VinInfo | null> {
  try {
    const res = await got(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
      { timeout: { request: 15_000 }, retry: { limit: 1 } },
    ).json<{ Results: Record<string, string>[] }>();
    const r = res.Results?.[0];
    if (!r || !r.Make) return null;
    return {
      make: r.Make,
      model: r.Model,
      year: r.ModelYear ? parseInt(r.ModelYear, 10) : null,
      trim: [r.Trim, r.Series].filter(Boolean).join(' '),
    };
  } catch {
    return null;
  }
}
