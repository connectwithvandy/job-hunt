// Which places a job is open to, read from its free-text location.

const BLR = /\b(bengaluru|bangalore)\b/i;
const INDIA_OK = /india|worldwide|anywhere|global|apac|asia/i;

/** Remote, and not locked to other countries: "Remote (United States)" is out, "Remote (Worldwide)" or plain "Remote" is in. */
export function remoteForIndia(location: string, workSetting?: string | null) {
  const remote = workSetting === "remote" || /remote/i.test(location);
  if (!remote) return false;
  const restriction = location.match(/\(([^)]*)\)/)?.[1] ?? location.replace(/remote/gi, "").replace(/[-,·|]/g, " ").trim();
  return !restriction || INDIA_OK.test(restriction);
}

export function inBengaluru(location: string) {
  return BLR.test(location);
}
