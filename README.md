# LiveForge Studio

Site de transmissão de tela ao vivo via **WebRTC P2P**, com escolha de resolução, FPS, codec (AV1, H.265/HEVC, VP9, H.264/AVC, VP8), bitrate, áudio do sistema e adaptação à conexão.

## Executar (sem dependências)

Requer Node.js **20 ou mais recente**.

```bash
npm start
```

Ou `node server.js`. Abra **http://localhost:3000** no computador transmissor. Clique em **Iniciar transmissão**, permita a captura da tela e envie o link da sala aos espectadores.

### Instalação automática no Windows

1. Extraia todo o arquivo ZIP.
2. Abra a pasta `LiveForge` e execute **`instalar.bat`** com um duplo clique.
3. Caso o Node.js 20+ não esteja disponível, o instalador tenta instalar a versão LTS usando o **winget** (o Windows pode solicitar confirmação ou privilégios). Se o winget não estiver disponível, ele abre a página oficial do Node.js para instalação manual.
4. O instalador tenta criar um atalho **LiveForge Studio** na área de trabalho. Ao final, escolha se deseja iniciar o site.
5. Para iniciar novamente depois, use o atalho ou o arquivo `iniciar_windows.bat`. O site fica disponível em **http://localhost:3000** enquanto o servidor estiver em execução.

**Observação:** o projeto não exige `npm install`: ele usa apenas recursos nativos do Node.js. O instalador não configura um serviço do Windows, HTTPS nem acesso remoto público automaticamente. Para compartilhar a transmissão com outros dispositivos fora de `localhost`, consulte a seção de publicação abaixo.

## Opções de ambiente

| Variável | Padrão | Explicação |
|---|---|---|
| `PORT` | `3000` | Porta HTTP do site |
| `MAX_VIEWERS` | `12` | Limite de espectadores P2P por sala |
| `MAX_ROOMS` | `100` | Quantidade máxima de salas |
| `TURN_URL` | não definido | URLs TURN separadas por vírgula, por exemplo `turn:turn.exemplo.com:3478` |
| `TURN_USERNAME` | não definido | Usuário TURN |
| `TURN_CREDENTIAL` | não definido | Senha TURN |

Exemplo Linux/macOS:

```bash
PORT=3000 TURN_URL=turn:turn.exemplo.com:3478 TURN_USERNAME=conta TURN_CREDENTIAL=senha npm start
```

Windows PowerShell:

```powershell
$env:PORT='3000'; npm start
```

## Notas técnicas e limitações

- O compartilhamento de tela precisa de **HTTPS** quando acessado fora de `localhost` (inclusive por outra máquina em rede local). Em produção, configure HTTPS por Caddy, Nginx, Traefik ou equivalente.
- WebRTC faz negociação dos codecs. H.265 e AV1 só funcionam quando o navegador transmissor **e** receptor os aceitam. A lista detectada indica suporte provável, não garante uso efetivo.
- A aceleração por hardware é administrada pelo navegador e pelo sistema. Sites não podem selecionar diretamente a GPU ou obrigar NVENC, AMF, Quick Sync, etc. O codec efetivamente negociado aparece nas estatísticas.
- A resolução real depende do monitor ou janela de origem, do navegador e da capacidade da rede. Escolher 4K não converte magicamente uma fonte 1080p em 4K. A qualidade é ajustada via `RTCRtpSender.setParameters` quando suportado.
- O áudio do sistema é oferecido apenas em determinadas combinações de navegador, sistema e superfície compartilhada.
- Streaming usa conexões **P2P separadas por espectador** (mesh de um emissor para cada viewer). Por isso 12 é apenas um limite de proteção, não uma garantia de capacidade: 4K com muitos espectadores exige largura de banda e recursos consideráveis. Para dezenas/centenas de espectadores use **SFU** (LiveKit, mediasoup, Janus) ou ingestão de vídeo + **HLS/LL-HLS**.
- STUN público pode não alcançar conexões em NAT restrito. **TURN** é essencial para confiabilidade de acesso externo. O servidor não fornece TURN automaticamente.
- As salas vivem na memória deste processo Node.js e são perdidas ao reiniciá-lo. Não há login, chat, pagamentos, gravação ou CDN. Links de espectador podem ser compartilhados com qualquer pessoa que os possua.
- Este projeto é um **MVP funcional**, não uma plataforma de transmissão escalável pronta para produção sem infraestrutura adicional, segurança, métricas e testes.

## Publicar para espectadores em outros dispositivos

1. Instale Node.js 20+ em uma VPS, servidor ou computador acessível.
2. Execute `npm start`.
3. Configure um domínio e um proxy reverso HTTPS. Há um exemplo em `Caddyfile.example`.
4. Se os usuários estiverem atrás de NATs restritivos, configure suas credenciais TURN com as variáveis acima.
5. Libere as portas do proxy HTTPS (443/TCP) e as portas UDP necessárias ao serviço TURN.

Você também pode gerar a imagem com `docker build -t liveforge .` e executá-la com `docker run -p 3000:3000 liveforge`. O Docker não dispensa HTTPS nem TURN.

## Organização

- `server.js`: servidor HTTP e sinalização WebRTC usando Server-Sent Events e POST (sem dependências de terceiros)
- `public/index.html`: interface de estúdio/espectador
- `public/styles.css`: aparência responsiva
- `public/app.js`: captura, negociação, codecs, qualidade adaptativa, UI e estatísticas
