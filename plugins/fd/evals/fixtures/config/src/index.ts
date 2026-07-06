export interface Widget {
  id: string;
  label: string;
}

export function makeWidget(id: string, label: string): Widget {
  return { id, label };
}
