import _ from 'lodash';

export function stripInternal(payload: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const copy = _.cloneDeep(payload);
  for (const path of paths) {
    _.unset(copy, path);
  }
  return copy;
}
