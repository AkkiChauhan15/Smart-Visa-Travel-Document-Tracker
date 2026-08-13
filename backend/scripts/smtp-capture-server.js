import net from 'node:net';

export async function startSmtpCaptureServer() {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 svt-test ESMTP ready\r\n');
    let buffer = '';
    let dataMode = false;
    let messageData = '';

    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (dataMode) {
          if (line === '.') {
            messages.push(messageData);
            messageData = '';
            dataMode = false;
            socket.write(`250 2.0.0 accepted-${messages.length}\r\n`);
          } else {
            messageData += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
          }
          continue;
        }

        const command = line.split(' ', 1)[0].toUpperCase();
        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250-svt-test\r\n250 SIZE 10485760\r\n');
        } else if (command === 'MAIL' || command === 'RCPT' || command === 'RSET' || command === 'NOOP') {
          socket.write('250 2.0.0 ok\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 2.0.0 bye\r\n');
          socket.end();
        } else {
          socket.write('502 5.5.2 unsupported command\r\n');
        }
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  return {
    host: '127.0.0.1',
    port: address.port,
    messages,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

