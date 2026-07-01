// Docker multiplex log stream demultiplexer
export function decodeDockerStream(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return '';
  if (buffer.length < 8) {
    return buffer.toString('utf-8');
  }
  
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  let text = '';
  
  const firstByte = view.getUint8(0);
  if (firstByte !== 0 && firstByte !== 1 && firstByte !== 2) {
    return buffer.toString('utf-8');
  }
  
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = view.getUint32(offset + 4, false);
    offset += 8;
    
    if (offset + size > buffer.length) {
      text += buffer.subarray(offset).toString('utf-8');
      break;
    }
    
    text += buffer.subarray(offset, offset + size).toString('utf-8');
    offset += size;
  }
  
  return text;
}
