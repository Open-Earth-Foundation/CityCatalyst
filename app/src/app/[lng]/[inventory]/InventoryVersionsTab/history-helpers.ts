import { VersionHistoryEntry } from "@/util/types";

const maxVersionGroupSecondsElapsed = 60 * 60; // 1 hour

// groups version history by same author and max time elapsed since the start of the session
export function groupInventoryHistory(
  versionEntries: VersionHistoryEntry[] | undefined,
): VersionHistoryEntry[][] {
  if (!versionEntries || versionEntries.length === 0) {
    return [];
  }

  let currentGroup = 0;
  const results = [[versionEntries[versionEntries.length - 1]]];

  for (let i = versionEntries.length - 2; i >= 0; i--) {
    const previousVersion = versionEntries[i + 1].version;
    const version = versionEntries[i].version;
    const firstGroupVersion = results[currentGroup][0].version;

    let timeSinceFirstGroupVersion = 0;
    if (version.created && firstGroupVersion.created) {
      const versionTime = new Date(version.created).getTime();
      const firstGroupTime = new Date(firstGroupVersion.created).getTime();
      timeSinceFirstGroupVersion = (versionTime - firstGroupTime) / 1000; // convert to seconds
    }

    if (
      previousVersion.author.userId !== version.author.userId ||
      timeSinceFirstGroupVersion > maxVersionGroupSecondsElapsed
    ) {
      currentGroup++;
      results.push([]);
    }

    results[currentGroup].push(versionEntries[i]);
  }

  // reverse each group internally to show most recent changes first
  for (const resultGroup of results) {
    resultGroup.reverse();
  }

  results.reverse();

  return results;
}
