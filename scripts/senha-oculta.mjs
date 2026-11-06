// Le uma senha do terminal sem mostrar o que e digitado.
import { stdin, stdout } from 'node:process';

export function perguntarOculto(pergunta, entrada = stdin, saida = stdout) {
  if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
    return Promise.reject(new Error('Rode este comando em um terminal interativo.'));
  }
  return new Promise(resolve => {
    let valor = '';
    const encerrar = () => {
      entrada.removeListener('data', aoDigitar);
      entrada.setRawMode(false);
      entrada.pause();
      saida.write('\n');
    };
    const aoDigitar = dados => {
      for (const c of dados.toString('utf8')) {
        if (c === '\r' || c === '\n') {
          encerrar();
          resolve(valor);
          return;
        }
        if (c === '\u0003') { // Ctrl+C
          encerrar();
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') {
          valor = [...valor].slice(0, -1).join('');
        } else if (c >= ' ') {
          valor += c;
        }
      }
    };
    saida.write(pergunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.on('data', aoDigitar);
  });
}
