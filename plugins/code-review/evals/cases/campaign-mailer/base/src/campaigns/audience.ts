export type Segment = { name: string; emails: string[] };

export function segmentSizes(segments: Segment[]): Map<string, number> {
  const sizeMap = new Map<string, number>();

  for (const segment of segments) {
    sizeMap.set(segment.name, segment.emails.length);
  }

  return sizeMap;
}
