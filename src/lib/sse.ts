export type SseEvent = { event: string; data: string };

export function parseSseFrames(input: string): { events: SseEvent[]; rest: string } {
  const frames = input.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? '';
  const events = frames.flatMap((frame) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    return data.length ? [{ event, data: data.join('\n') }] : [];
  });
  return { events, rest };
}
