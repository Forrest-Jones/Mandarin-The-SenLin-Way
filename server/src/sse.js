// Minimal server-sent-events parser over a ReadableStream of bytes.
export async function* parseSse(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const flush = function* () {
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const evt = { event: '', data: '' };
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) evt.event = line.slice(6).trim();
        else if (line.startsWith('data:')) evt.data += (evt.data ? '\n' : '') + line.slice(5).replace(/^ /, '');
      }
      if (evt.data) yield evt;
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      yield* flush();
    }
    buf += dec.decode().replace(/\r\n/g, '\n');
    if (buf && !buf.endsWith('\n\n')) buf += '\n\n';
    yield* flush();
  } finally {
    reader.releaseLock();
  }
}

export const sseLine = (obj) => `data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`;
