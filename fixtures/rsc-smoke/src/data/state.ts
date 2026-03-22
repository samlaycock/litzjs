export const projects: Array<{ id: string; name: string }> = [
  { id: "project-1", name: "Alpha" },
  { id: "project-2", name: "Beta" },
];

export const quickProjects: Array<{ id: string; name: string }> = [];

export let reportsLoadCount = 0;
export let revalidateCount = 1;

export const feedItemsById: Record<string, Array<{ id: string; message: string }>> = {
  team: [{ id: "feed-1", message: "Initial team update" }],
};

export function nextReportsLoadCount(): number {
  reportsLoadCount += 1;
  return reportsLoadCount;
}

export function incrementRevalidateCount(): number {
  revalidateCount += 1;
  return revalidateCount;
}

export function appendProject(name: string): Array<{ id: string; name: string }> {
  projects.push({
    id: `project-${projects.length + 1}`,
    name,
  });

  return projects;
}

export function appendQuickProject(name: string): { id: string; name: string } {
  const project = {
    id: `quick-${quickProjects.length + 1}`,
    name,
  };

  quickProjects.push(project);
  return project;
}

export function getFeedItems(feedId: string): Array<{ id: string; message: string }> {
  return feedItemsById[feedId] ?? [];
}

export function appendFeedItem(
  feedId: string,
  message: string,
): Array<{ id: string; message: string }> {
  const items = feedItemsById[feedId] ?? [];
  const nextItems = [
    ...items,
    {
      id: `feed-${items.length + 1}`,
      message,
    },
  ];

  feedItemsById[feedId] = nextItems;
  return nextItems;
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
