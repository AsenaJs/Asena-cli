/** Reads a byte stream to its end, handing each chunk to `onChunk` and each complete line to `onLine`. */
export const pipeLines = async (
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  onChunk?: (chunk: Uint8Array) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let pending = '';

  const emit = (line: string) => onLine(line.endsWith('\r') ? line.slice(0, -1) : line);

  const reader = stream.getReader();

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    const chunk = read.value;

    onChunk?.(chunk);
    pending += decoder.decode(chunk, { stream: true });

    let newline = pending.indexOf('\n');

    while (newline !== -1) {
      emit(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }

  pending += decoder.decode();

  if (pending !== '') emit(pending);
};
