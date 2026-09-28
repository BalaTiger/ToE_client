export function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('socket.io-client 加载失败'));
      return;
    }
    if (window.io) {
      resolve(window.io);
      return;
    }
    const script = document.createElement('script');
    script.src = '/socket.io.min.js';
    script.onload = () => resolve(window.io);
    script.onerror = () => reject(new Error('socket.io-client 加载失败'));
    document.head.appendChild(script);
  });
}
